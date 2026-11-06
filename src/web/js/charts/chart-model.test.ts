import { suite, test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import {
  type ChartData,
  axisScale,
  formatAxis,
  keepWindow,
  labelIndex,
  moveWindow,
  niceStep,
  setWindow,
  ticks,
  windowRange,
} from "./_chart-model.js";

const chart = (c: Partial<ChartData>): ChartData => ({
  kind: "average",
  style: "line",
  labels: [],
  series: [],
  ...c,
});

suite("Chart model", () => {
  test("niceStep rounds up to 1, 2, 2.5 or 5 times a power of ten", () => {
    deepStrictEqual([0.9, 1.5, 2.2, 4, 7, 23].map(niceStep), [1, 2, 2.5, 5, 10, 25]);
    strictEqual(niceStep(0), 1);
  });

  test("axisScale fits the data to round ticks", () => {
    const c = chart({ series: [{ label: "W", values: [181.3, null, 189.6], color: "" }] });
    deepStrictEqual(axisScale(c, false), { lo: 180, hi: 190, step: 2.5 });
    deepStrictEqual(ticks(axisScale(c, false)!), [180, 182.5, 185, 187.5, 190]);
  });

  test("axisScale keeps an axis's limits and grows bars from zero", () => {
    const c = chart({
      style: "bar",
      series: [
        { label: "Success", values: [1, 1], color: "" },
        { label: "σ", values: [null, null], color: "", rightAxis: true },
      ],
      left: { min: 0, max: 1 },
      right: { min: 0 },
    });
    deepStrictEqual(axisScale(c, false), { lo: 0, hi: 1, step: 0.25 });
    // Nothing on the right and no top to it: no axis.
    strictEqual(axisScale(c, true), undefined);
    const bars = chart({ style: "bar", series: [{ label: "N", values: [3, 7], color: "" }] });
    deepStrictEqual(axisScale(bars, false), { lo: 0, hi: 8, step: 2 });
  });

  test("formatAxis drops trailing zeros", () => {
    deepStrictEqual([180, 182.5, 0.25, 1.1000001].map(formatAxis), ["180", "182.5", "0.25", "1.1"]);
  });

  test("the window keeps two labels on show, inside the chart", () => {
    deepStrictEqual(setWindow(10, 4, 4), { zoomed: true, lo: 3, hi: 4 });
    deepStrictEqual(setWindow(10, -3, 20), { zoomed: false, lo: 0, hi: 9 });
    // Moved past an end, it slides back, keeping its size.
    deepStrictEqual(moveWindow(10, -2, 3), { zoomed: true, lo: 0, hi: 5 });
    deepStrictEqual(moveWindow(10, 7, 12), { zoomed: true, lo: 4, hi: 9 });
    deepStrictEqual(windowRange({ zoomed: false, lo: 2, hi: 3 }, 10), [0, 9]);
    deepStrictEqual(windowRange({ zoomed: true, lo: 2, hi: 3 }, 10), [2, 3]);
  });

  test("keepWindow keeps the labels on show when the data changes", () => {
    const old = ["2026-01-04", "2026-01-11", "2026-01-18", "2026-01-25", "2026-02-01"];
    // Two weeks more at the start: the same weeks stay on show.
    const longer = chart({ labels: ["2025-12-21", "2025-12-28", ...old] });
    deepStrictEqual(keepWindow({ zoomed: true, lo: 1, hi: 2 }, old, longer), {
      zoomed: true,
      lo: 3,
      hi: 4,
    });
    // A window at the end stays at the end, the same width.
    deepStrictEqual(keepWindow({ zoomed: true, lo: 3, hi: 4 }, old, longer), {
      zoomed: true,
      lo: 5,
      hi: 6,
    });
    // Not zoomed, or too short to zoom, shows it all.
    deepStrictEqual(keepWindow({ zoomed: false, lo: 0, hi: 0 }, old, longer).zoomed, false);
    deepStrictEqual(
      keepWindow({ zoomed: true, lo: 1, hi: 2 }, old, chart({ labels: old.slice(3) })).zoomed,
      false,
    );
  });

  test("labelIndex finds the last label at or before a date or weight", () => {
    const c = chart({ labels: ["2026-01-04", "2026-01-11", "2026-01-18"] });
    strictEqual(labelIndex(c, "2026-01-12"), 1);
    strictEqual(labelIndex(c, "2025-12-31"), 0);
    strictEqual(labelIndex(c, "2027-01-01"), 2);
    const h = chart({ kind: "histogram", labels: ["98", "99", "100", "101"] });
    // By number, not as text: "100" sorts before "99".
    strictEqual(labelIndex(h, "100.5"), 2);
  });
});
