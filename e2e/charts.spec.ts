import { test, expect, type User } from "./fixtures.js";
import { addDays, dateString, thisSunday, today } from "./dates.js";

// Eleven weeks of entries, losing a pound a week: 190 every day of the week
// ten weeks back, down to 180 every day this week. Sleep is 7.5 hours from a
// 22:30 bedtime, right on the goal. The weeks start on Sunday, as the app's.
// Returns the dates seeded.
async function seedWeeks(user: User) {
  let first = addDays(thisSunday(), -70);
  let records: Record<string, unknown> = {};
  let dates: string[] = [];
  for (let d = first; d <= today(); d = addDays(d, 1)) {
    let date = dateString(d);
    let daysBack = Math.round((+thisSunday() - +d) / 864e5);
    let weeksBack = Math.max(0, Math.ceil(daysBack / 7));
    records[date] = { date, weight: 180 + weeksBack, bedtime: "22:30", sleep: 7.5, _rev: 0 };
    dates.push(date);
  }
  records["user-settings"] = {
    earliestDate: dateString(first),
    height: 70,
    goalWeight: 170,
    bedtime: "22:30",
    _rev: 0,
  };
  await user.seed(records);
  return dates;
}

type Chart = ReturnType<User["page"]["locator"]>;

// Opens a chart from its button: the button shows it open, and the chart
// comes in.
async function openChart(user: User, button: string, chart: string) {
  await user.page.click(`#${button}`);
  await expect(user.page.locator(`#${button}`)).toHaveAttribute("aria-pressed", "true");
  let section = user.page.locator(`#${chart}`);
  await expect(section).toBeVisible();
  return section;
}

// The chart's data, as the page draws it.
async function chartData(chart: Chart) {
  return JSON.parse((await chart.getAttribute("data-chart"))!) as {
    labels: string[];
    series: { label: string; values: (number | null)[]; rightAxis?: boolean }[];
  };
}

// The values a series plots, leaving out the gaps.
async function values(chart: Chart, series: string) {
  let data = await chartData(chart);
  let s = data.series.find((x) => x.label === series);
  expect(s, `series ${series}`).toBeTruthy();
  return s!.values.filter((x) => x != null);
}

// How many of the canvas's pixels are drawn on.
function inked(chart: Chart) {
  return chart.locator("canvas").evaluate((c: HTMLCanvasElement) => {
    let { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) count++;
    return count;
  });
}

test.describe("the Charts page", () => {
  test("shows this week's stats against last week's and the goal", async ({ guest }) => {
    let a = await guest();
    await seedWeeks(a);
    await a.goto("/web/charts");

    await expect(a.page.locator("#stats h3")).toHaveText("Stats");
    await expect(a.page.locator(".stats dt")).toHaveText([
      "Weight",
      "Rate",
      "BMI Prime",
      "Sleep",
      "Weeks to Go",
      "σ",
      "Goal",
    ]);
    // BMI prime: 180 / 70² × 703 / 25. The weight is the same all week, so σ
    // is 0, which shows as a dash. At a pound a week, 10 pounds to go is ten
    // weeks at both the average loss and the average change.
    await expect(a.page.locator(".stats dd")).toHaveText([
      "180.00",
      "-1.00",
      "1.033",
      "7.50",
      "10.0 to 10.0",
      "—",
      "170.00",
    ]);
    // The chart styles are a stylesheet of their own.
    expect(
      await a.page.evaluate(() =>
        Array.from(document.styleSheets).some((x) => x.href?.includes("/web/css/charts")),
      ),
    ).toBe(true);
  });

  test("draws each chart from the entries", async ({ guest }) => {
    let a = await guest();
    let dates = await seedWeeks(a);
    let weeks = 11;
    await a.goto("/web/charts");
    await expect(a.page.locator("#charts-location")).toBeEmpty();

    let history = await openChart(a, "history-chart-btn", "history-chart");
    expect(await values(history, "Weight")).toHaveLength(dates.length);
    await expect(history.locator(".legend li")).toHaveText(["Weight"]);
    await expect.poll(() => inked(history)).toBeGreaterThan(1000);

    let average = await openChart(a, "avg-chart-btn", "average-chart");
    await expect(average.locator(".legend li")).toHaveText(["Max", "Average", "Min"]);
    let averages = await values(average, "Average");
    expect(averages).toHaveLength(weeks);
    expect(averages.at(-1)).toBe(180);
    expect(averages[0]).toBe(190);
    expect(await values(average, "Max")).toEqual(averages);
    // Charts come in above the ones already open.
    expect(
      await a.page.locator("#charts-location > section").evaluateAll((xs) => xs.map((x) => x.id)),
    ).toEqual(["average-chart", "history-chart"]);

    let histogram = await openChart(a, "histogram-chart-btn", "histogram-chart");
    let counts = await chartData(histogram);
    expect(counts.labels).toEqual(Array.from({ length: weeks }, (_, i) => String(180 + i)));
    // A full week at 181; this week has a day per day so far.
    expect(counts.series[0].values[1]).toBe(7);
    expect(counts.series[0].values[0]).toBe(new Date().getDay() + 1);

    let bedtime = await openChart(a, "bedtime-chart-btn", "bedtime-chart");
    expect(await values(bedtime, "Bedtime Success")).toEqual(Array(weeks).fill(1));
    expect(await values(bedtime, "Standard Deviation")).toEqual([]);

    let sleep = await openChart(a, "sleep-chart-btn", "sleep-chart");
    expect(await values(sleep, "Average Sleep for Week")).toEqual(Array(weeks).fill(7.5));
    expect(await values(sleep, "Standard Deviation")).toEqual([]);

    let rate = await openChart(a, "rate-chart-btn", "rate-chart");
    expect(await values(rate, "Weight Lost")).toEqual(Array(weeks - 1).fill(-1));
    expect(await values(rate, "Weight Gained")).toEqual([]);
    expect(new Set(await values(rate, "Overall Weight Change"))).toEqual(new Set([-1]));

    for (let chart of [history, average, histogram, bedtime, sleep, rate]) {
      expect(await inked(chart)).toBeGreaterThan(1000);
    }
  });

  test("reads out a chart's points from the keyboard", async ({ guest }) => {
    let a = await guest();
    await seedWeeks(a);
    let sunday = dateString(thisSunday());
    await a.goto("/web/charts");
    let average = await openChart(a, "avg-chart-btn", "average-chart");
    let canvas = average.locator("canvas");
    let readout = average.locator(".chart-readout");

    await canvas.focus();
    await a.page.keyboard.press("ArrowLeft");
    await expect(readout).toHaveText(`${sunday}, Max: 180, Average: 180, Min: 180`);
    await a.page.keyboard.press("ArrowLeft");
    await expect(readout).toHaveText(
      `${dateString(addDays(thisSunday(), -7))}, Max: 181, Average: 181, Min: 181`,
    );
    // The period goes back before the entries: its first week has none.
    await a.page.keyboard.press("Home");
    await expect(readout).toHaveText((await chartData(average)).labels[0]);
  });

  test("zooms in on part of a chart and back out", async ({ guest }) => {
    let a = await guest();
    await seedWeeks(a);
    let sunday = thisSunday();
    await a.goto("/web/charts");
    let average = await openChart(a, "avg-chart-btn", "average-chart");
    let first = (await chartData(average)).labels[0];
    let from = average.locator(".chart-from");
    let to = average.locator(".chart-to");
    await expect(from).toHaveValue(first);
    await expect(to).toHaveValue(dateString(sunday));

    // A date inside a week starts the window at that week.
    await from.fill(dateString(addDays(sunday, -19)));
    await from.dispatchEvent("change");
    await expect(from).toHaveValue(dateString(addDays(sunday, -21)));
    let canvas = average.locator("canvas");
    await canvas.focus();
    await a.page.keyboard.press("Home");
    await expect(average.locator(".chart-readout")).toContainText("Average: 183");

    // Dragging the plot right shows earlier weeks.
    let box = (await canvas.boundingBox())!;
    let y = box.y + box.height * 0.3;
    await a.page.mouse.move(box.x + box.width * 0.4, y);
    await a.page.mouse.down();
    await a.page.mouse.move(box.x + box.width * 0.9, y, { steps: 5 });
    await a.page.mouse.up();
    await expect(to).not.toHaveValue(dateString(sunday));
    await expect(from).not.toHaveValue(dateString(addDays(sunday, -21)));

    await average.getByRole("button", { name: "Show all" }).click();
    await expect(from).toHaveValue(first);
    await expect(to).toHaveValue(dateString(sunday));
  });

  test("closes a chart from its button or its ×", async ({ guest }) => {
    let a = await guest();
    await seedWeeks(a);
    await a.goto("/web/charts");
    let button = a.page.locator("#history-chart-btn");
    await expect(button).toHaveAttribute("aria-pressed", "false");

    await openChart(a, "history-chart-btn", "history-chart");
    await button.click();
    await expect(a.page.locator("#history-chart")).toHaveCount(0);
    await expect(button).toHaveAttribute("aria-pressed", "false");

    let history = await openChart(a, "history-chart-btn", "history-chart");
    await history.getByRole("button", { name: "Close the History chart" }).click();
    await expect(a.page.locator("#history-chart")).toHaveCount(0);
    await expect(button).toHaveAttribute("aria-pressed", "false");
  });

  test("says when there is nothing to draw", async ({ guest }) => {
    let a = await guest();
    await a.goto("/web/charts");
    await expect(a.page.locator(".stats dd").first()).toHaveText("—");
    for (let [button, chart] of [
      ["history-chart-btn", "history-chart"],
      ["histogram-chart-btn", "histogram-chart"],
    ]) {
      let section = await openChart(a, button, chart);
      await expect(section.locator(".chart-empty")).toHaveText(
        "Not enough data for this chart yet.",
      );
      await expect(section.locator("canvas")).toHaveCount(0);
    }
  });

  test("covers the chart period, which redraws the open charts", async ({ guest }) => {
    let a = await guest();
    await seedWeeks(a);
    await a.goto("/web/charts");
    await expect(a.page.locator("input[name=duration]")).toHaveValue("9");
    await expect(a.page.locator("select[name=durationUnit]")).toHaveValue("month");
    let average = await openChart(a, "avg-chart-btn", "average-chart");
    let history = await openChart(a, "history-chart-btn", "history-chart");
    expect(await values(average, "Average")).toHaveLength(11);
    // Zoomed in on the last two weeks.
    let sunday = dateString(thisSunday());
    let lastWeek = dateString(addDays(thisSunday(), -7));
    await average.locator(".chart-from").fill(lastWeek);
    await average.locator(".chart-from").dispatchEvent("change");

    await a.saveField("input[name=duration]", "2");
    await a.saveField("select[name=durationUnit]", "week");
    expect(await a.idb("chart-settings")).toEqual({ duration: 2, durationUnit: "week", _rev: 0 });
    // A per-device preference: not synced.
    expect(await a.pending()).toEqual([]);

    // Two weeks back, a week more, and back to a Sunday: this week and the
    // three before it. The charts stay where they were, and open.
    await expect.poll(() => values(average, "Average")).toEqual([183, 182, 181, 180]);
    expect(
      await a.page.locator("#charts-location > .chart").evaluateAll((xs) => xs.map((x) => x.id)),
    ).toEqual(["history-chart", "average-chart"]);
    await expect(history.locator("canvas")).toHaveCount(1);
    // Still zoomed in on the same weeks.
    await expect(average.locator(".chart-from")).toHaveValue(lastWeek);
    await expect(average.locator(".chart-to")).toHaveValue(sunday);
    await expect(a.page.locator("#avg-chart-btn")).toHaveAttribute("aria-pressed", "true");
    await expect(a.page.locator("#stats dd").first()).toHaveText("180.00");

    // And it's kept.
    await a.goto("/web/charts");
    await expect(a.page.locator("input[name=duration]")).toHaveValue("2");
    await expect(a.page.locator("select[name=durationUnit]")).toHaveValue("week");
  });

  test("won't take a chart period that isn't positive", async ({ guest }) => {
    let a = await guest();
    await a.goto("/web/charts");
    await a.saveField("select[name=durationUnit]", "week");
    let saved = await a.idb("chart-settings");
    let field = a.page.locator("input[name=duration]");
    await field.fill("0");
    await field.press("Tab");
    await expect(a.page.getByText("The chart period must be a positive number.")).toBeVisible();
    expect(await a.idb("chart-settings")).toEqual(saved);
    // The field goes back to the period saved.
    await expect(field).toHaveValue("9");
    await expect(a.page.locator("select[name=durationUnit]")).toHaveValue("week");
  });
});
