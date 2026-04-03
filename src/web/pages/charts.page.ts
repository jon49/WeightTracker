import { ChartSettings, UserSettings, WeightData } from "../server/db.js";
import { RouteGetHandler, RoutePage } from "@jon49/sw/routes.middleware.js";
import { createChartHtml } from "./charts/_chart.js";

let {
  charts: { getGoalWeight, getStartDate, getWeeklyData },
  db: { get, getMany },
  html,
  layout,
  utils: { avg, dateAdd, dateFill, formatNumber, getPreviousDay, isNil, reduceSlice, round, setDefaults, stdev, cssRes },
} = self.sw;

async function getChartSettings() {
  let rawChartSettings = await get("chart-settings");
  return setDefaults(rawChartSettings, [
    ["duration", 9],
    ["durationUnit", "month"],
  ]);
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
    <a id=history-chart-btn role=button target=htmz href="?handler=historyChart">History</a>
    <a id=avg-chart-btn role=button target=htmz href="?handler=averageChart">Average</a>
    <a id=histogram-chart-btn role=button target=htmz href="?handler=histogramChart">Histogram</a>
    <a id=bedtime-chart-btn role=button target=htmz href="?handler=bedtimeChart">Bedtime</a>
    <a id=sleep-chart-btn role=button target=htmz href="?handler=sleepChart">Sleep</a>
    <a id=rate-chart-btn role=button target=htmz href="?handler=rateChart">Rate</a>
</div>

<div id=charts-location></div>
`;

async function weeksToGo(
  userSettings: UserSettings | undefined,
  chartSettings: ChartSettings,
  weightDataGetter: (start: Date) => Promise<WeightData[]>,
) {
  const weeklyData = await getWeeklyData(chartSettings, weightDataGetter);
  if (!weeklyData) return;
  let { avgValues } = weeklyData;
  const length = avgValues.length,
    currentWeight = avgValues[length - 1],
    goalWeight = getGoalWeight(userSettings);
  if (!goalWeight) return;
  let all = new Array(length - 1),
    neg = new Array(length - 1);
  for (let index = 1; index < length; index++) {
    let difference = avgValues[index] - avgValues[index - 1];
    if (Number.isNaN(difference)) continue;
    all[index - 1] = difference;
    if (difference < 0) {
      neg[index - 1] = difference;
    }
  }
  let avgAll = avg(all);
  let avgNeg = avg(neg);
  if (isNil(avgAll) || isNil(avgNeg)) return;
  avgAll = -avgAll;
  avgNeg = -avgNeg;
  let diff = currentWeight - +goalWeight;
  return `${formatNumber(diff / avgNeg, 1)} to ${formatNumber(diff / avgAll, 1)}`;
}

async function setupStats(): Promise<{ statsHeaderText: string; statsData: StatsData }> {
  const [chartSettings, userSettings] = await Promise.all([
    getChartSettings(),
    get("user-settings"),
  ]);
  const now = new Date();
  const startDate = getPreviousDay(new Date(), 0);
  const dates = dateFill(startDate, now);
  const [previousData, dataUnfiltered] = await Promise.all([
    getMany<WeightData>(dateFill(dateAdd(startDate, -7), dateAdd(startDate, -1))),
    getMany<WeightData>(dates),
  ]);
  const weeksToGoData = await weeksToGo(userSettings, chartSettings, (startDate: Date) =>
    getMany(dateFill(startDate, new Date())),
  );
  const data = dataUnfiltered.filter((x) => x);
  const weights = data.filter((x) => x.weight).map((x) => x.weight);
  const averageWeight = avg(weights);
  const previousWeightAvg = avg(previousData.filter((x) => x?.weight).map((x) => x.weight));
  // @ts-ignore
  const previousWeekSleepAvg = avg(data.filter((x) => x.sleep > 0).map((x) => x.sleep));
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
      weeksToGo: weeksToGoData,
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
      cssLinks: [`?handler=css`],
    });
  },

  async averageChart() {
    const chartSettings = await getChartSettings();
    const weeklyData = await getWeeklyData(chartSettings, (startDate: Date) =>
      getMany(dateFill(startDate, new Date())),
    );

    if (!weeklyData) {
      return html`<template id="avg-chart-btn"></template>`;
    }

    const { labels, maxValues, minValues, avgValues } = weeklyData;

    const r = (v: number | null) => v != null ? round(v, 1) : v;
    const chartHtml = createChartHtml("average-chart", labels, {
      labels,
      datasets: [
        { label: "Max", data: maxValues.map(r), lineColor: "#ff6384" },
        { label: "Average", data: avgValues.map(r), lineColor: "#63ff83" },
        { label: "Min", data: minValues.map(r), lineColor: "#6391ff" },
      ],
      xPaddingPercent: 5,
    });

    return html`
      <template id="avg-chart-btn"></template>
      <template hz-target="#charts-location" hz-swap="prepend">${chartHtml}</template>
    `;
  },
  async rateChart() {
    const chartSettings = await getChartSettings();
    const weeklyData = await getWeeklyData(chartSettings, (startDate: Date) =>
      getMany(dateFill(startDate, new Date())),
    );

    if (!weeklyData) {
      return html`<template id="rate-chart-btn"></template>`;
    }

    const { labels: weekLabels, avgValues } = weeklyData;
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
        if (diff > 0) {
          pos = round(diff, 2);
          allTotal += diff;
        } else {
          neg = round(diff, 2);
          allTotal += diff;
          negTotal += diff;
        }
      }
      posValues.push(pos);
      negValues.push(neg);
    }

    const overallChange = count > 0 ? round(allTotal / count, 2) : null;
    const overallLoss = count > 0 ? round(negTotal / count, 2) : null;

    const chartHtml = createChartHtml("rate-chart", rateLabels, {
      labels: rateLabels,
      datasets: [
        { label: "Weight Gained", data: posValues, lineColor: "#6391ff" },
        { label: "Weight Lost", data: negValues, lineColor: "#ff6384" },
        { label: "Overall Weight Change", data: rateLabels.map(() => overallChange), lineColor: "#63ff83" },
        { label: "Overall Weight Loss", data: rateLabels.map(() => overallLoss), lineColor: "#ff6384" },
      ],
      xPaddingPercent: 5,
    });

    return html`
      <template id="rate-chart-btn"></template>
      <template hz-target="#charts-location" hz-swap="prepend">${chartHtml}</template>
    `;
  },

  async bedtimeChart() {
    const [chartSettings, userSettings] = await Promise.all([
      getChartSettings(),
      get("user-settings"),
    ]);
    const bedtimeGoal = userSettings?.bedtime;
    const startDate = getStartDate(chartSettings.duration, chartSettings.durationUnit);
    const dates = dateFill(startDate, new Date());
    const rawValues = await getMany<WeightData>(dates);

    const timeToNum = (t: string) => {
      const b = t.split(":");
      return round(+b[0] + +b[1] / 60, 3);
    };
    const hoursAfterGoal = (time: number, goalTime: number) => {
      let hours = time - goalTime;
      if (hours < 0) hours += 24;
      return hours > 12 ? 0 : hours;
    };
    const goalTime = timeToNum(bedtimeGoal ?? "22:00");

    const values = reduceSlice(
      dates,
      7,
      (acc: { date: string | null; std: number | null; success: number | null }, val: string, index: number) => {
        if (acc.date) return acc;
        acc.date = val;
        const bedtimesForWeek = rawValues
          .slice(index, index + 7)
          .filter((x: WeightData | undefined) => x?.bedtime)
          .map((x: WeightData) => timeToNum(x.bedtime as string));
        acc.std = round(stdev(bedtimesForWeek) || 0, 3) || null;
        const successValues = bedtimesForWeek.map(
          (x: number) => round(1 - hoursAfterGoal(x, goalTime) / 12, 3),
        );
        acc.success = round(avg(successValues) || 0, 3) || null;
        return acc;
      },
      () => ({ date: null, std: null, success: null }) as { date: string | null; std: number | null; success: number | null },
    );

    const chartLabels = values.map((x: { date: string | null }) => x.date as string);

    if (chartLabels.length === 0) {
      return html`<template id="bedtime-chart-btn"></template>`;
    }

    const chartHtml = createChartHtml("bedtime-chart", chartLabels, {
      labels: chartLabels,
      datasets: [
        { label: "Bedtime Success", data: values.map((x: { success: number | null }) => x.success), lineColor: "#ff6384", yAxis: "left" },
        { label: "Standard Deviation", data: values.map((x: { std: number | null }) => x.std), lineColor: "rgba(0, 200, 0, 0.5)", yAxis: "right" },
      ],
      chartType: "bar",
      xPaddingPercent: 5,
      yAxes: {
        left: { min: 0, exactMax: 1 },
        right: { min: 0 },
      },
    });

    return html`
      <template id="bedtime-chart-btn"></template>
      <template hz-target="#charts-location" hz-swap="prepend">${chartHtml}</template>
    `;
  },

  async sleepChart() {
    const chartSettings = await getChartSettings();
    const startDate = getStartDate(chartSettings.duration, chartSettings.durationUnit);
    const dates = dateFill(startDate, new Date());
    const rawValues = await getMany<WeightData>(dates);

    const values = reduceSlice(
      dates,
      7,
      (acc: { date: string | null; avg: number | null; std: number | null }, val: string, index: number) => {
        if (acc.date) return acc;
        acc.date = val;
        const v = rawValues.slice(index, index + 7).map((x: WeightData | undefined) => x?.sleep);
        acc.avg = avg(v) || null;
        acc.std = round(stdev(v) || 0, 2) || null;
        return acc;
      },
      () => ({ date: null, avg: null, std: null }) as { date: string | null; avg: number | null; std: number | null },
    );

    const chartLabels = values.map((x: { date: string | null }) => x.date as string);

    if (chartLabels.length === 0) {
      return html`<template id="sleep-chart-btn"></template>`;
    }

    const chartHtml = createChartHtml("sleep-chart", chartLabels, {
      labels: chartLabels,
      datasets: [
        { label: "Average Sleep for Week", data: values.map((x: { avg: number | null }) => x.avg), lineColor: "#ff6384", yAxis: "left" },
        { label: "Standard Deviation", data: values.map((x: { std: number | null }) => x.std), lineColor: "#63ff83", yAxis: "right" },
      ],
      xPaddingPercent: 5,
      yAxes: {
        left: { min: 0 },
        right: { min: 0 },
      },
    });

    return html`
      <template id="sleep-chart-btn"></template>
      <template hz-target="#charts-location" hz-swap="prepend">${chartHtml}</template>
    `;
  },

  async histogramChart() {
    const userSettings = await get("user-settings");
    const startDate = userSettings?.earliestDate;
    if (!startDate) {
      return html`<template id="histogram-chart-btn"></template>`;
    }
    const split = startDate.split("-");
    const labels = dateFill(new Date(+split[0], +split[1] - 1, +split[2]), new Date());
    const rawValues = await getMany<WeightData>(labels);

    const counts: Record<number, number> = {};
    for (const val of rawValues) {
      const weight = (val?.weight || 0) | 0;
      if (weight) {
        counts[weight] = (counts[weight] || 0) + 1;
      }
    }

    const keys = Object.keys(counts).map(Number).sort((a, b) => a - b);
    if (keys.length === 0) {
      return html`<template id="histogram-chart-btn"></template>`;
    }

    const minKey = keys[0];
    const maxKey = keys[keys.length - 1];
    const histLabels: string[] = [];
    const histData: number[] = [];
    for (let i = minKey; i <= maxKey; i++) {
      histLabels.push(String(i));
      histData.push(counts[i] ?? 0);
    }

    const chartHtml = createChartHtml("histogram-chart", histLabels, {
      labels: histLabels,
      datasets: [
        { label: "Weight (Count)", data: histData, lineColor: "#ff6384" },
      ],
      chartType: "bar",
      xPaddingPercent: 3,
      yAxes: { left: { min: 0 } },
    });

    return html`
      <template id="histogram-chart-btn"></template>
      <template hz-target="#charts-location" hz-swap="prepend">${chartHtml}</template>
    `;
  },

  async historyChart() {
    const userSettings = await get("user-settings");
    const startDate = userSettings?.earliestDate;
    if (!startDate) {
      return html`<template id="history-chart-btn"></template>`;
    }
    const split = startDate.split("-");
    const labels = dateFill(new Date(+split[0], +split[1] - 1, +split[2]), new Date());
    const rawValues = await getMany<WeightData>(labels);
    const values = rawValues.map((x: WeightData | undefined) => x?.weight || null);
    const showLines = labels.length < 500;

    const chartHtml = createChartHtml("history-chart", labels, {
      labels,
      datasets: [
        { label: "Weight", data: values, lineColor: "#ff6384", showLines },
      ],
      xPaddingPercent: 2,
    });

    return html`
      <template id="history-chart-btn"></template>
      <template hz-target="#charts-location" hz-swap="prepend">${chartHtml}</template>
    `;
  },

  css() {
    return cssRes(`
:root {
  color-scheme: light dark;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, sans-serif;
  background: canvas;
  color: canvastext;
}

.chart {
  --line-color: rgb(29 78 216);
  --fill-color: color-mix(in oklab, var(--line-color) 26%, transparent);
  width: 100%;
  padding: 1rem;
  border: 1px solid color-mix(in oklab, canvastext 14%, transparent);
  border-radius: 12px;
}

.plot {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: clip;
  background:
    linear-gradient(to top, color-mix(in oklab, canvastext 12%, transparent) 1px, transparent 1px) 0 0 / 100% 20%,
    linear-gradient(to right, color-mix(in oklab, canvastext 8%, transparent) 1px, transparent 1px) 0 0 / 20% 100%;
  background-color: color-mix(in oklab, canvas 96%, canvastext 4%);
}

.y-axis {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3.25rem;
  margin: 0;
  padding: 0.3rem 0.35rem;
  list-style: none;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  color: color-mix(in oklab, canvastext 76%, transparent);
  pointer-events: none;
  background: linear-gradient(to right, color-mix(in oklab, canvas 94%, transparent), transparent);
  z-index: 2;
}

.y-axis li {
  position: absolute;
  left: 0.35rem;
  transform: translateY(-50%);
  line-height: 1;
  text-shadow: 0 1px 0 color-mix(in oklab, canvas 92%, transparent);
  white-space: nowrap;
}

.y-axis-right {
  inset: 0 0 0 auto;
  text-align: right;
  background: linear-gradient(to left, color-mix(in oklab, canvas 94%, transparent), transparent);
}

.y-axis-right li {
  left: auto;
  right: 0.35rem;
}

.series {
  position: absolute;
  inset: 0;
  --line-color: rgb(29 78 216);
  pointer-events: none;
}

.series-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.series-line-shape {
  opacity: 1;
}

.bar-segment {
  cursor: pointer;
}

.points {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;
}

.points li {
  position: absolute;
  left: var(--x);
  top: var(--y);
}

.point-btn {
  width: var(--point-size, 0.7rem);
  aspect-ratio: 1;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: canvas;
  border: var(--point-border-width, 2px) solid var(--line-color);
  display: block;
  padding: 0;
  cursor: pointer;
  pointer-events: auto;
}

.point-btn:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--line-color) 55%, white);
  outline-offset: 2px;
}

.point-popover {
  margin: 0;
  border: 0;
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  font-size: 0.8rem;
  color: white;
  background: rgb(17 24 39);
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.25);
}

.point-popover::backdrop {
  background: transparent;
}

.legend {
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.85rem;
  align-items: center;
  font-size: 0.85rem;
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.legend-swatch {
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 999px;
  background: var(--legend-color, currentColor);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, canvas 40%, transparent);
  flex: 0 0 auto;
}

.legend-label {
  line-height: 1;
}

.labels {
  margin: 0.75rem 0 0;
  padding: 0;
  padding-inline: var(--x-padding, 0%);
  box-sizing: border-box;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(var(--count, 1), minmax(0, 1fr));
  gap: 0.5rem;
  font-size: 0.85rem;
  text-align: center;
}

.labels-angled {
  margin-top: 0.35rem;
  min-height: 3.5rem;
  align-items: start;
  overflow: clip;
}

.labels-angled li {
  justify-self: center;
  display: inline-block;
  white-space: nowrap;
  text-align: left;
  transform: rotate(-35deg);
  transform-origin: top right;
  font-size: 0.72rem;
}

.labels .is-missing {
  opacity: 0.55;
}

.labels .is-sparse {
  visibility: hidden;
}

.data {
  display: none;
}`)
  }
}

const route: RoutePage = {
  get: getHanders,
};

export default route;
