const { html } = self.sw;

const DEFAULT_COLOR = "rgb(29 78 216)";
// At most this many x-axis labels are shown; the rest are left blank.
const MAX_VISIBLE_LABELS = 14;

function formatAxisValue(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
}

// bySize shrinks a mark from `few` (up to 20 points) to `many` (100 points or
// more), so dense charts don't turn into a solid smear.
function bySize(pointCount: number, few: number, many: number) {
  if (!(pointCount > 20)) return few;
  if (pointCount >= 100) return many;
  const ratio = (pointCount - 20) / 80;
  return Number((few - ratio * (few - many)).toFixed(2));
}

type NormalizedPoint = {
  index: number;
  label: string;
  value: number | null;
  valid: boolean;
  x: number;
  y: number;
};

type Dataset = {
  label?: string;
  data?: (number | null)[];
  lineColor?: string;
  showLines?: boolean;
  yAxis?: "left" | "right";
};

type NormalizedDataset = {
  label: string;
  data: (number | null)[];
  lineColor: string;
  showLines?: boolean;
  yAxis?: "left" | "right";
};

type Scale = { minValue?: number; maxValue?: number; xPaddingPercent?: number };

// createChartModel places each value on a 0–100 grid. `xPaddingPercent` is a
// fraction of the width (0–0.45).
function createChartModel(
  labels: string[],
  values: (number | null)[],
  showLines: boolean,
  scale: Scale,
) {
  const xPaddingPercent = scale.xPaddingPercent ?? 0;
  const count = Math.max(labels.length, values.length);
  const min = scale.minValue ?? 0;
  const max = scale.maxValue ?? 0;
  const range = max - min;

  const normalized: NormalizedPoint[] = new Array(count);
  const validPoints: NormalizedPoint[] = [];
  for (let index = 0; index < count; index++) {
    const value = values[index];
    const valid = Number.isFinite(value);
    const x =
      count === 1
        ? 50
        : xPaddingPercent * 100 + (index / (count - 1)) * (100 - xPaddingPercent * 200);
    const y = !valid ? NaN : range === 0 ? 50 : 100 - ((value! - min) / range) * 100;
    const point = { index, label: labels[index] ?? `item ${index + 1}`, value, valid, x, y };
    normalized[index] = point;
    if (valid) validPoints.push(point);
  }

  // Lines break where a value is missing.
  const linePointSegments: string[] = [];
  if (showLines && validPoints.length >= 2) {
    let currentSegment: string[] = [];
    for (const point of normalized) {
      if (!point.valid) {
        if (currentSegment.length >= 2) linePointSegments.push(currentSegment.join(" "));
        currentSegment = [];
        continue;
      }
      currentSegment.push(`${point.x.toFixed(2)},${point.y.toFixed(2)}`);
    }
    if (currentSegment.length >= 2) linePointSegments.push(currentSegment.join(" "));
  }

  return { count: Math.max(count, 1), validPoints, linePointSegments };
}

const normalizeDatasets = (datasets: Dataset[]): NormalizedDataset[] =>
  datasets.map((dataset, index) => ({
    label: dataset.label ? String(dataset.label) : `Series ${index + 1}`,
    data: dataset.data ?? [],
    lineColor: dataset.lineColor ?? DEFAULT_COLOR,
    showLines: dataset.showLines,
    yAxis: dataset.yAxis,
  }));

const createSeriesHtml = (
  labels: string[],
  dataset: NormalizedDataset,
  index: number,
  scale: Scale,
  chartType: "line" | "bar",
) => {
  const chart = createChartModel(labels, dataset.data, dataset.showLines ?? true, scale);
  const seriesColor = dataset.lineColor;
  const pointCount = chart.validPoints.length;
  const colorStyle =
    "--line-color:" +
    seriesColor +
    "; --point-size:" +
    bySize(pointCount, 0.7, 0.36) +
    "rem; --point-border-width:" +
    bySize(pointCount, 2, 1) +
    "px;";

  let svgContent = "";
  let pointsHtml = "";
  if (chartType === "bar") {
    const minValue = scale.minValue ?? 0;
    const maxValue = scale.maxValue ?? 0;
    const range = maxValue - minValue;
    const baselineY =
      range > 0 ? Math.min(100, Math.max(0, 100 - ((0 - minValue) / range) * 100)) : 100;
    const count = chart.count;
    const usableWidth = 100 - 2 * (scale.xPaddingPercent ?? 0) * 100;
    const barWidth =
      count > 1 ? (usableWidth / (count - 1)) * 0.85 : Math.min(10, usableWidth * 0.8);

    const bars = chart.validPoints;
    const barSvg = new Array<string>(bars.length);
    for (let i = 0; i < bars.length; i++) {
      const point = bars[i];
      const barHeight = Math.max(0, baselineY - point.y);
      const barX = point.x - barWidth / 2;
      barSvg[i] =
        '<rect class="bar-segment" x="' +
        barX.toFixed(2) +
        '" y="' +
        point.y.toFixed(2) +
        '" width="' +
        barWidth.toFixed(2) +
        '" height="' +
        barHeight.toFixed(2) +
        '" fill="' +
        seriesColor +
        '" opacity="0.8" pointer-events="auto" cursor="pointer" data-label="' +
        point.label +
        '" data-value="' +
        point.value +
        '"/>';
    }
    svgContent = barSvg.join("");
  } else {
    const strokeWidth = bySize(pointCount, 1.8, 0.8);
    for (const points of chart.linePointSegments) {
      svgContent +=
        '<polyline points="' +
        points +
        '" stroke="' +
        seriesColor +
        '" fill="none" stroke-width="' +
        strokeWidth +
        '" stroke-linecap="round" stroke-linejoin="round"></polyline>';
    }

    const points = new Array<string>(pointCount);
    for (let i = 0; i < pointCount; i++) {
      const point = chart.validPoints[i];
      points[i] =
        '<li style="--x:' +
        point.x.toFixed(2) +
        "%; --y:" +
        point.y.toFixed(2) +
        '%"><button class="point-btn" type="button" data-label="' +
        point.label +
        '" data-value="' +
        point.value +
        '" aria-label="' +
        point.label +
        ": " +
        point.value +
        '"></button></li>';
    }
    if (pointCount)
      pointsHtml = '<ol class="points" aria-hidden="true">' + points.join("") + "</ol>";
  }

  return html`
      <div class="series" data-series-index="${index}" data-series-label="${dataset.label}" style="$${colorStyle}">
        <svg class="series-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          $${svgContent}
        </svg>
        $${pointsHtml}
      </div>
    `;
};

const createLabelsHtml = (labels: string[], count: number) => {
  const step = count > MAX_VISIBLE_LABELS ? Math.ceil((count - 1) / (MAX_VISIBLE_LABELS - 1)) : 1;
  const result = new Array<string>(count);

  for (let index = 0; index < count; index += 1) {
    const label = labels[index] ?? `item ${index + 1}`;
    const showLabel = step === 1 || index === 0 || index === count - 1 || index % step === 0;
    result[index] = showLabel ? "<li>" + label + "</li>" : '<li class="is-sparse"></li>';
  }

  return result.join("");
};

const createLegendHtml = (datasets: NormalizedDataset[]) => {
  if (datasets.length === 0) return "";
  const items = datasets.map(
    (dataset) =>
      '<li><span class="legend-swatch" style="--legend-color:' +
      dataset.lineColor +
      ';"></span><span class="legend-label">' +
      dataset.label +
      "</span></li>",
  );
  return '<ol class="legend" aria-label="Chart series">' + items.join("") + "</ol>";
};

type AxisConfig = { min?: number; max?: number; exactMin?: number; exactMax?: number };

type ChartOptions = {
  datasets: Dataset[];
  chartType?: "line" | "bar";
  // Percent of the width (or, at most 1, a fraction of it) left empty at
  // each side.
  xPaddingPercent: number;
  yAxes?: {
    left?: AxisConfig;
    right?: AxisConfig;
  };
};

type AxisDomain = {
  minLabel: number;
  maxLabel: number;
  midLabel: number;
  minDomain: number;
  maxDomain: number;
};

// Proportional padding so dual y-axes always align their labels
const TOP_PAD = 0.08;
const BOTTOM_PAD = 0.03;

function computeAxisDomain(values: number[], axisConfig?: AxisConfig): AxisDomain | null {
  if (values.length === 0) return null;

  let rawMin = Infinity;
  let rawMax = -Infinity;
  for (const v of values) {
    if (v < rawMin) rawMin = v;
    if (v > rawMax) rawMax = v;
  }

  if (Number.isFinite(axisConfig?.min)) rawMin = Math.min(rawMin, axisConfig!.min!);
  if (Number.isFinite(axisConfig?.max)) rawMax = Math.max(rawMax, axisConfig!.max!);

  const minLabel = Number.isFinite(axisConfig?.exactMin)
    ? axisConfig!.exactMin!
    : Math.floor(rawMin / 5) * 5;
  const maxLabel = Number.isFinite(axisConfig?.exactMax)
    ? axisConfig!.exactMax!
    : Math.ceil(rawMax / 5) * 5;
  const labelRange = maxLabel - minLabel;

  let minDomain: number;
  let maxDomain: number;
  if (labelRange === 0) {
    const fallback = Math.max(Math.abs(maxLabel), 1);
    minDomain = minLabel - fallback * 0.5;
    maxDomain = maxLabel + fallback * 0.5;
  } else {
    const domainRange = labelRange / (1 - TOP_PAD - BOTTOM_PAD);
    minDomain = minLabel - BOTTOM_PAD * domainRange;
    maxDomain = minDomain + domainRange;
  }

  return {
    minLabel,
    maxLabel,
    midLabel: (minLabel + maxLabel) / 2,
    minDomain,
    maxDomain,
  };
}

function makeYAxisHtml(domain: AxisDomain, cssClass: string) {
  const domainRange = domain.maxDomain - domain.minDomain;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const tickPos = (value: number) =>
    domainRange > 0 ? clamp(100 - ((value - domain.minDomain) / domainRange) * 100) : 50;

  return (
    '<ol class="' +
    cssClass +
    '" aria-hidden="true">' +
    '<li style="top:' +
    tickPos(domain.maxLabel).toFixed(2) +
    '%;">' +
    formatAxisValue(domain.maxLabel) +
    "</li>" +
    '<li style="top:' +
    tickPos(domain.midLabel).toFixed(2) +
    '%;">' +
    formatAxisValue(domain.midLabel) +
    "</li>" +
    '<li style="top:' +
    tickPos(domain.minLabel).toFixed(2) +
    '%;">' +
    formatAxisValue(domain.minLabel) +
    "</li>" +
    "</ol>"
  );
}

export const createChartHtml = (targetId: string, labels: string[], options: ChartOptions) => {
  const datasets = normalizeDatasets(options.datasets);
  const rawXPadding = options.xPaddingPercent;
  const xPaddingPercent = Math.max(
    0,
    Math.min(0.45, rawXPadding > 1 ? rawXPadding / 100 : rawXPadding),
  );

  const leftDatasets = datasets.filter((d) => (d.yAxis ?? "left") === "left");
  const rightDatasets = datasets.filter((d) => d.yAxis === "right");

  const collectValues = (datasets: NormalizedDataset[]) =>
    datasets.flatMap((d) => d.data).filter((v): v is number => Number.isFinite(v));

  const leftDomain = computeAxisDomain(collectValues(leftDatasets), options.yAxes?.left);
  const rightDomain = rightDatasets.length
    ? computeAxisDomain(collectValues(rightDatasets), options.yAxes?.right)
    : null;

  const makeScale = (domain: AxisDomain | null): Scale =>
    domain ? { minValue: domain.minDomain, maxValue: domain.maxDomain, xPaddingPercent } : {};

  const leftScale = makeScale(leftDomain);
  const rightScale = makeScale(rightDomain);

  const chartType = options.chartType ?? "line";
  const seriesHtml = datasets.map((dataset, index) =>
    createSeriesHtml(
      labels,
      dataset,
      index,
      dataset.yAxis === "right" ? rightScale : leftScale,
      chartType,
    ),
  );

  const leftYAxisHtml = leftDomain ? makeYAxisHtml(leftDomain, "y-axis") : "";
  const rightYAxisHtml = rightDomain ? makeYAxisHtml(rightDomain, "y-axis y-axis-right") : "";

  const maxDataCount = datasets.reduce((max, d) => Math.max(max, d.data.length), 0);
  const count = Math.max(labels.length, maxDataCount, 1);
  const shouldAngleLabels = count > MAX_VISIBLE_LABELS;
  const labelsHtml = createLabelsHtml(labels, count);
  const legendHtml = createLegendHtml(datasets);
  const style = `--count:${count}; --x-padding:${(xPaddingPercent * 100).toFixed(2)}%;`;

  return html`
    <section id="${targetId}" class="chart" aria-label="Chart" style="${style}">
      <div class="plot">
        $${leftYAxisHtml}
        $${rightYAxisHtml}
        ${seriesHtml}
      </div>
      $${legendHtml}
      <ol class="labels$${shouldAngleLabels ? " labels-angled" : ""}">$${labelsHtml}</ol>
      <div class="point-popover" popover="manual"></div>
    </section>
  `;
};
