// The data for one chart, as the charts page sends it to the browser, and
// the arithmetic for drawing it. Ported from the native client
// (native/core/charts.v and native/chart_view.v), so both draw alike.

export type ChartKind = "history" | "average" | "histogram" | "bedtime" | "sleep" | "rate";

export interface Series {
  label: string;
  // null where there is no value.
  values: (number | null)[];
  color: string;
  // Lines without their points, for flat reference lines.
  hidePoints?: boolean;
  rightAxis?: boolean;
}

// AxisLimits pins an axis end; a missing end fits the data.
export interface AxisLimits {
  min?: number;
  max?: number;
}

export interface ChartData {
  kind: ChartKind;
  style: "line" | "bar";
  labels: string[];
  series: Series[];
  left?: AxisLimits;
  right?: AxisLimits;
}

export interface AxisScale {
  lo: number;
  hi: number;
  step: number;
}

// niceStep rounds a tick step up to 1, 2, 2.5 or 5 times a power of ten.
export function niceStep(raw: number) {
  if (!(raw > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

// axisScale fits the left or right axis to its series' values and limits,
// with about four ticks. There is none when it has nothing to show.
export function axisScale(c: ChartData, right: boolean): AxisScale | undefined {
  const limits = (right ? c.right : c.left) ?? {};
  const hasMin = limits.min != null;
  const hasMax = limits.max != null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of c.series) {
    if (!!s.rightAxis !== right) continue;
    for (const v of s.values) {
      if (v == null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (lo === Infinity) {
    if (!hasMin || !hasMax) return;
    lo = limits.min!;
    hi = limits.max!;
  }
  if (c.style === "bar") {
    // Bars grow from zero.
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (hasMin) lo = limits.min!;
  if (hasMax) hi = hasMin ? limits.max! : Math.max(limits.max!, hi);
  if (hi <= lo) {
    hi = lo + 1;
    lo -= 1;
  }
  const step = niceStep((hi - lo) / 4);
  if (!hasMin) lo = Math.floor(lo / step) * step;
  if (!hasMax) hi = Math.ceil(hi / step) * step;
  return { lo, hi, step };
}

// ticks returns the values the axis labels and grid lines go at.
export function ticks(a: AxisScale) {
  const result: number[] = [];
  for (let i = 0; a.lo + i * a.step <= a.hi + a.step / 2; i++) {
    result.push(a.lo + i * a.step);
  }
  return result;
}

export function formatAxis(v: number) {
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

// ---- the part of a chart on show ----

// ChartWindow is the part of a chart on show: labels lo to hi inclusive,
// when zoomed.
export interface ChartWindow {
  zoomed: boolean;
  lo: number;
  hi: number;
}

// windowRange returns the first and last label on show of a chart with n.
export function windowRange(w: ChartWindow, n: number): [number, number] {
  if (!w.zoomed || w.hi > n - 1) return [0, n - 1];
  return [w.lo, w.hi];
}

// setWindow shows labels lo to hi, keeping at least two on show.
export function setWindow(n: number, lo: number, hi: number): ChartWindow {
  const h = Math.min(Math.max(hi, 1), n - 1);
  const l = Math.min(Math.max(lo, 0), h - 1);
  return { zoomed: l > 0 || h < n - 1, lo: l, hi: h };
}

// moveWindow shows labels lo to hi, sliding them back inside the chart.
export function moveWindow(n: number, lo: number, hi: number): ChartWindow {
  const last = n - 1;
  if (lo < 0) return setWindow(n, 0, hi - lo);
  if (hi > last) return setWindow(n, lo - (hi - last), last);
  return setWindow(n, lo, hi);
}

// slice returns the part of a chart from label lo to label hi, inclusive.
export function slice(c: ChartData, lo: number, hi: number): ChartData {
  return {
    ...c,
    labels: c.labels.slice(lo, hi + 1),
    series: c.series.map((s) => ({ ...s, values: s.values.slice(lo, hi + 1) })),
  };
}

// labelIndex returns the last label at or before `key` (a date, or a
// weight for the histogram), or 0 when key comes before them all.
export function labelIndex(c: ChartData, key: string) {
  let i = 0;
  for (let j = 0; j < c.labels.length; j++) {
    const l = c.labels[j];
    const before = c.kind === "histogram" ? +l <= +key : l <= key;
    if (!before) break;
    i = j;
  }
  return i;
}
