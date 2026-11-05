import { UserSettings, WeightData } from "../server/db.js";
import { RouteGetHandler, RoutePage } from "@jon49/sw/routes.middleware.js";
import { createChartHtml } from "./charts/_chart.js";

let {
  charts: {
    bedtimeSuccess,
    estimateWeeksToGo,
    getGoalWeight,
    getStartDate,
    getWeeklyData,
    timeToNumber,
  },
  db: { get, getMany },
  html,
  layout,
  utils: {
    avg,
    dateAdd,
    dateFill,
    dateToString,
    formatNumber,
    getPreviousDay,
    isNil,
    parseDate,
    round,
    setDefaults,
    stdev,
  },
} = self.sw;

async function getChartSettings() {
  let rawChartSettings = await get("chart-settings");
  return setDefaults(rawChartSettings, [
    ["duration", 9],
    ["durationUnit", "month"],
  ]);
}

// chartRange reads the entries for the period the chart settings ask for,
// from the Sunday it starts on to today.
async function chartRange() {
  const chartSettings = await getChartSettings();
  const dates = dateFill(
    getStartDate(chartSettings.duration, chartSettings.durationUnit),
    new Date(),
  );
  const values = await getMany<WeightData | undefined>(dates);
  return { chartSettings, dates, values };
}

// allEntries reads every entry from the earliest date to today.
async function allEntries() {
  const start = (await get("user-settings"))?.earliestDate;
  if (!start) return;
  const dates = dateFill(parseDate(start), new Date());
  const values = await getMany<WeightData | undefined>(dates);
  return { dates, values };
}

// byWeek splits the range into weeks, giving each week's first date and entries.
function byWeek(dates: string[], values: (WeightData | undefined)[]) {
  const weeks: { date: string; values: (WeightData | undefined)[] }[] = [];
  for (let i = 0; i < dates.length; i += 7) {
    weeks.push({ date: dates[i], values: values.slice(i, i + 7) });
  }
  return weeks;
}

// chartResponse clears the chart's button and, when there is a chart, adds it.
function chartResponse(buttonId: string, chart?: ReturnType<typeof createChartHtml>) {
  return html`
      <template id="${buttonId}"></template>
      ${chart ? html`<template hz-target="#charts-location" hz-swap="prepend">${chart}</template>` : null}
    `;
}

const render = ({
  statsHeaderText,
  statsData,
}: {
  statsHeaderText: string;
  statsData: StatsData;
}) => html`
<h2>Charts <a href="/web/charts/edit" title="Edit Chart Settings" aria-label="Edit Chart Settings">&#9881;</a></h2>

<div>
    <h3>${statsHeaderText}</h3>
<div class="overflow-auto">
    <table>
        <thead>
            <tr>
                <th>Weight</th>
                <th>Rate</th>
                <th>BMI Prime</th>
                <th>Sleep</th>
                <th>Weeks to Go</th>
                <th>&sigma;</th>
                <th>Goal</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>${statsData.weight}</td>
                <td>${statsData.rate}</td>
                <td>${statsData.bmiPrime}</td>
                <td>${statsData.sleep}</td>
                <td>${statsData.weeksToGo}</td>
                <td>${statsData.std}</td>
                <td>${statsData.goalWeight}</td>
            </tr>
        </tbody>
    </table>
</div>
</div>

<div id=create-chart class="flex m-1">
    <a id=history-chart-btn class=nc-button role=button target=htmz href="?handler=historyChart">History</a>
    <a id=avg-chart-btn class=nc-button role=button target=htmz href="?handler=averageChart">Average</a>
    <a id=histogram-chart-btn class=nc-button role=button target=htmz href="?handler=histogramChart">Histogram</a>
    <a id=bedtime-chart-btn class=nc-button role=button target=htmz href="?handler=bedtimeChart">Bedtime</a>
    <a id=sleep-chart-btn class=nc-button role=button target=htmz href="?handler=sleepChart">Sleep</a>
    <a id=rate-chart-btn class=nc-button role=button target=htmz href="?handler=rateChart">Rate</a>
</div>

<div id=charts-location></div>
`;

async function setupStats(): Promise<{ statsHeaderText: string; statsData: StatsData }> {
  const [{ chartSettings, dates, values }, userSettings] = await Promise.all([
    chartRange(),
    get("user-settings"),
  ]);
  // The chart range starts at least a week before this one, so it holds
  // both this week and last.
  const thisWeek = getPreviousDay(new Date(), 0);
  const thisWeekIndex = dates.indexOf(dateToString(thisWeek));
  const lastWeekIndex = dates.indexOf(dateToString(dateAdd(thisWeek, -7)));
  const data = values.slice(thisWeekIndex).filter((x): x is WeightData => !!x);
  const previousData = values.slice(lastWeekIndex, thisWeekIndex);

  const weights = data.filter((x) => x.weight).map((x) => x.weight);
  const averageWeight = avg(weights);
  const previousWeightAvg = avg(previousData.map((x) => x?.weight));
  const previousWeekSleepAvg = avg(data.map((x) => x.sleep));
  const std = stdev(weights);

  let bmiPrime;
  let goalWeight = getGoalWeight(userSettings);
  if (userSettings?.height && !isNil(averageWeight)) {
    let heightSquared = Math.pow(userSettings.height, 2);
    bmiPrime = formatNumber(((averageWeight / heightSquared) * 703) / 25, 3);
  }

  return {
    statsHeaderText: `Stats for past ${chartSettings.duration} ${chartSettings.durationUnit}s`,
    statsData: {
      bmiPrime: bmiPrime || "",
      weeksToGo: weeksToGo(userSettings, getWeeklyData(dates, values).avgValues),
      std: formatNumber(std, 2),
      goalWeight,
      weight: formatNumber(averageWeight, 2),
      rate:
        previousWeightAvg && averageWeight
          ? formatNumber(averageWeight - previousWeightAvg, 2)
          : "N/A",
      sleep: formatNumber(previousWeekSleepAvg, 2),
    },
  };
}

function weeksToGo(userSettings: UserSettings | undefined, avgValues: (number | null)[]) {
  const goalWeight = getGoalWeight(userSettings);
  if (!goalWeight) return;
  return estimateWeeksToGo(avgValues, +goalWeight);
}

interface StatsData {
  bmiPrime: string;
  goalWeight: string | undefined;
  rate: string | undefined;
  sleep: string | undefined;
  std: string | undefined;
  weeksToGo: string | undefined;
  weight: string | undefined;
}

const getHanders: RouteGetHandler = {
  get: async () => {
    let data = await setupStats();
    return layout({
      main: render(data),
      scripts: ["/web/js/charts-page.bundle.js"],
      title: "Charts",
      cssLinks: ["/web/css/charts.css"],
    });
  },

  async averageChart() {
    const { dates, values } = await chartRange();
    const { labels, maxValues, minValues, avgValues } = getWeeklyData(dates, values);

    const r = (v: number | null) => (v != null ? round(v, 1) : v);
    const chartHtml = createChartHtml("average-chart", labels, {
      datasets: [
        { label: "Max", data: maxValues.map(r), lineColor: "#ff6384" },
        { label: "Average", data: avgValues.map(r), lineColor: "#63ff83" },
        { label: "Min", data: minValues.map(r), lineColor: "#6391ff" },
      ],
      xPaddingPercent: 5,
    });

    return chartResponse("avg-chart-btn", chartHtml);
  },

  async rateChart() {
    const { dates, values } = await chartRange();
    const { labels: weekLabels, avgValues } = getWeeklyData(dates, values);
    const length = avgValues.length;
    const rateLabels: string[] = [];
    const posValues: (number | null)[] = [];
    const negValues: (number | null)[] = [];
    let allTotal = 0;
    let negTotal = 0;
    let count = 0;

    for (let index = 1; index < length; index++) {
      const first = avgValues[index - 1];
      const last = avgValues[index];
      rateLabels.push(weekLabels[index]);
      let pos: number | null = null;
      let neg: number | null = null;
      if (first && last) {
        count++;
        const diff = last - first;
        allTotal += diff;
        if (diff > 0) {
          pos = round(diff, 2);
        } else {
          neg = round(diff, 2);
          negTotal += diff;
        }
      }
      posValues.push(pos);
      negValues.push(neg);
    }

    const overallChange = count > 0 ? round(allTotal / count, 2) : null;
    const overallLoss = count > 0 ? round(negTotal / count, 2) : null;

    const chartHtml = createChartHtml("rate-chart", rateLabels, {
      datasets: [
        { label: "Weight Gained", data: posValues, lineColor: "#6391ff" },
        { label: "Weight Lost", data: negValues, lineColor: "#ff6384" },
        {
          label: "Overall Weight Change",
          data: rateLabels.map(() => overallChange),
          lineColor: "#63ff83",
        },
        {
          label: "Overall Weight Loss",
          data: rateLabels.map(() => overallLoss),
          lineColor: "#ff9f40",
        },
      ],
      xPaddingPercent: 5,
    });

    return chartResponse("rate-chart-btn", chartHtml);
  },

  async bedtimeChart() {
    const [{ dates, values }, userSettings] = await Promise.all([
      chartRange(),
      get("user-settings"),
    ]);
    const goalTime = timeToNumber(userSettings?.bedtime ?? "22:00");

    const weeks = byWeek(dates, values).map((week) => {
      const bedtimes = week.values.filter((x) => x?.bedtime).map((x) => timeToNumber(x!.bedtime!));
      return {
        date: week.date,
        std: round(stdev(bedtimes) || 0, 3) || null,
        success: round(avg(bedtimeSuccess(bedtimes, goalTime)) || 0, 3) || null,
      };
    });
    if (weeks.length === 0) return chartResponse("bedtime-chart-btn");

    const chartLabels = weeks.map((x) => x.date);
    const chartHtml = createChartHtml("bedtime-chart", chartLabels, {
      datasets: [
        {
          label: "Bedtime Success",
          data: weeks.map((x) => x.success),
          lineColor: "#ff6384",
          yAxis: "left",
        },
        {
          label: "Standard Deviation",
          data: weeks.map((x) => x.std),
          lineColor: "rgba(0, 200, 0, 0.5)",
          yAxis: "right",
        },
      ],
      chartType: "bar",
      xPaddingPercent: 5,
      yAxes: {
        left: { min: 0, exactMax: 1 },
        right: { min: 0 },
      },
    });

    return chartResponse("bedtime-chart-btn", chartHtml);
  },

  async sleepChart() {
    const { dates, values } = await chartRange();

    const weeks = byWeek(dates, values).map((week) => {
      const sleep = week.values.map((x) => x?.sleep);
      return {
        date: week.date,
        avg: avg(sleep) || null,
        std: round(stdev(sleep) || 0, 2) || null,
      };
    });
    if (weeks.length === 0) return chartResponse("sleep-chart-btn");

    const chartLabels = weeks.map((x) => x.date);
    const chartHtml = createChartHtml("sleep-chart", chartLabels, {
      datasets: [
        {
          label: "Average Sleep for Week",
          data: weeks.map((x) => x.avg),
          lineColor: "#ff6384",
          yAxis: "left",
        },
        {
          label: "Standard Deviation",
          data: weeks.map((x) => x.std),
          lineColor: "#63ff83",
          yAxis: "right",
        },
      ],
      xPaddingPercent: 5,
      yAxes: {
        left: { min: 0 },
        right: { min: 0 },
      },
    });

    return chartResponse("sleep-chart-btn", chartHtml);
  },

  async histogramChart() {
    const entries = await allEntries();
    if (!entries) return chartResponse("histogram-chart-btn");

    const counts: Record<number, number> = {};
    for (const val of entries.values) {
      const weight = (val?.weight || 0) | 0;
      if (weight) {
        counts[weight] = (counts[weight] || 0) + 1;
      }
    }

    const keys = Object.keys(counts)
      .map(Number)
      .sort((a, b) => a - b);
    if (keys.length === 0) return chartResponse("histogram-chart-btn");

    const minKey = keys[0];
    const maxKey = keys[keys.length - 1];
    const histLabels: string[] = [];
    const histData: number[] = [];
    for (let i = minKey; i <= maxKey; i++) {
      histLabels.push(String(i));
      histData.push(counts[i] ?? 0);
    }

    const chartHtml = createChartHtml("histogram-chart", histLabels, {
      datasets: [{ label: "Weight (Count)", data: histData, lineColor: "#ff6384" }],
      chartType: "bar",
      xPaddingPercent: 3,
      yAxes: { left: { min: 0 } },
    });

    return chartResponse("histogram-chart-btn", chartHtml);
  },

  async historyChart() {
    const entries = await allEntries();
    if (!entries) return chartResponse("history-chart-btn");
    const { dates: labels, values } = entries;

    const chartHtml = createChartHtml("history-chart", labels, {
      datasets: [
        {
          label: "Weight",
          data: values.map((x) => x?.weight || null),
          lineColor: "#ff6384",
          showLines: labels.length < 500,
        },
      ],
      xPaddingPercent: 2,
    });

    return chartResponse("history-chart-btn", chartHtml);
  },
};

const route: RoutePage = {
  get: getHanders,
};

export default route;
