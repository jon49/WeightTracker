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

// Opens a chart from its button: the button goes, and the chart comes in.
async function openChart(user: User, button: string, chart: string) {
  await user.page.click(`#${button}`);
  await expect(user.page.locator(`#${button}`)).toHaveCount(0);
  let section = user.page.locator(`#${chart}`);
  await expect(section).toBeVisible();
  return section;
}

// The values a series plots, as points or bars.
function values(chart: ReturnType<User["page"]["locator"]>, series: string) {
  return chart
    .locator(`.series[data-series-label="${series}"]`)
    .locator(".point-btn, .bar-segment")
    .evaluateAll((xs) => xs.map((x) => (x as HTMLElement).dataset.value));
}

test.describe("the Charts page", () => {
  test("shows this week's stats against last week's and the goal", async ({ guest }) => {
    let a = await guest();
    await seedWeeks(a);
    await a.goto("/web/charts");

    await expect(a.page.locator("h3")).toHaveText("Stats for past 9 months");
    await expect(a.page.locator("table th")).toHaveText([
      "Weight",
      "Rate",
      "BMI Prime",
      "Sleep",
      "Weeks to Go",
      "σ",
      "Goal",
    ]);
    // BMI prime: 180 / 70² × 703 / 25. The weight is the same all week, so σ
    // is 0, which shows as blank. At a pound a week, 10 pounds to go is ten
    // weeks at both the average loss and the average change.
    await expect(a.page.locator("table td")).toHaveText([
      "180.00",
      "-1.00",
      "1.033",
      "7.50",
      "10.0 to 10.0",
      "",
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
    let sunday = dateString(thisSunday());
    await a.goto("/web/charts");

    let history = await openChart(a, "history-chart-btn", "history-chart");
    expect(await values(history, "Weight")).toHaveLength(dates.length);
    await expect(history.locator("polyline")).toHaveCount(1);
    await expect(history.locator(".legend-label")).toHaveText(["Weight"]);

    let average = await openChart(a, "avg-chart-btn", "average-chart");
    await expect(average.locator(".legend-label")).toHaveText(["Max", "Average", "Min"]);
    let averages = await values(average, "Average");
    expect(averages).toHaveLength(weeks);
    expect(averages.at(-1)).toBe("180");
    expect(averages[0]).toBe("190");
    expect(await values(average, "Max")).toEqual(averages);
    // Charts come in above the ones already open.
    expect(
      await a.page.locator("#charts-location > section").evaluateAll((xs) => xs.map((x) => x.id)),
    ).toEqual(["average-chart", "history-chart"]);

    let histogram = await openChart(a, "histogram-chart-btn", "histogram-chart");
    let bars = histogram.locator(".bar-segment");
    await expect(bars).toHaveCount(weeks);
    expect(await bars.evaluateAll((xs) => xs.map((x) => (x as SVGElement).dataset.label))).toEqual(
      Array.from({ length: weeks }, (_, i) => String(180 + i)),
    );
    // A full week at 181; this week has a day per day so far.
    await expect(histogram.locator('.bar-segment[data-label="181"]')).toHaveAttribute(
      "data-value",
      "7",
    );
    await expect(histogram.locator('.bar-segment[data-label="180"]')).toHaveAttribute(
      "data-value",
      String(new Date().getDay() + 1),
    );

    let bedtime = await openChart(a, "bedtime-chart-btn", "bedtime-chart");
    expect(await values(bedtime, "Bedtime Success")).toEqual(Array(weeks).fill("1"));
    expect(await values(bedtime, "Standard Deviation")).toEqual([]);
    // Success runs 0 to 1; the deviation, always 0, gets no axis.
    await expect(bedtime.locator(".y-axis li").first()).toHaveText("1");
    await expect(bedtime.locator(".y-axis-right")).toHaveCount(0);

    let sleep = await openChart(a, "sleep-chart-btn", "sleep-chart");
    expect(await values(sleep, "Average Sleep for Week")).toEqual(Array(weeks).fill("7.5"));
    expect(await values(sleep, "Standard Deviation")).toEqual([]);

    let rate = await openChart(a, "rate-chart-btn", "rate-chart");
    expect(await values(rate, "Weight Lost")).toEqual(Array(weeks - 1).fill("-1"));
    expect(await values(rate, "Weight Gained")).toEqual([]);
    let overall = await values(rate, "Overall Weight Change");
    expect(new Set(overall)).toEqual(new Set(["-1"]));

    // Focusing a point shows its value.
    let point = average.locator('.series[data-series-label="Average"] .point-btn').last();
    await point.focus();
    await expect(average.locator(".point-popover")).toBeVisible();
    await expect(average.locator(".point-popover")).toHaveText(`Average · ${sunday}: 180`);
    await point.blur();
    await expect(average.locator(".point-popover")).toBeHidden();
  });

  test("leaves out the charts there is nothing to draw for", async ({ guest }) => {
    let a = await guest();
    await a.goto("/web/charts");
    await expect(a.page.locator("table td").first()).toHaveText("");
    for (let button of ["history-chart-btn", "histogram-chart-btn"]) {
      await a.page.click(`#${button}`);
      await expect(a.page.locator(`#${button}`)).toHaveCount(0);
    }
    await expect(a.page.locator("#charts-location > *")).toHaveCount(0);
  });

  test("covers the period set in the chart settings", async ({ guest }) => {
    let a = await guest();
    await seedWeeks(a);
    await a.goto("/web/charts");
    await a.page.click("a[title='Edit Chart Settings']");
    await a.page.waitForURL(/\/web\/charts\/edit/);
    await expect(a.page.locator("select[name=durationUnit]")).toHaveValue("month");

    await a.saveField("input[name=duration]", "2");
    await a.saveField("select[name=durationUnit]", "week");
    expect(await a.idb("chart-settings")).toEqual({ duration: 2, durationUnit: "week", _rev: 0 });
    // A per-device preference: not synced.
    expect(await a.pending()).toEqual([]);

    await a.goto("/web/charts");
    await expect(a.page.locator("h3")).toHaveText("Stats for past 2 weeks");
    let average = await openChart(a, "avg-chart-btn", "average-chart");
    // Two weeks back, a week more, and back to a Sunday: this week and the
    // three before it.
    expect(await values(average, "Average")).toEqual(["183", "182", "181", "180"]);
  });
});
