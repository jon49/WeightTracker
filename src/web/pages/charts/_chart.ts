
const {
  html
} = self.sw

function formatAxisValue(value: number) {
  if (!Number.isFinite(value)) {
    return '0';
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function getAdaptiveStrokeWidth(pointCount: number) {
  if (!Number.isFinite(pointCount) || pointCount <= 0) {
    return 1.8;
  }

  if (pointCount <= 20) {
    return 1.8;
  }

  if (pointCount >= 100) {
    return 0.8;
  }

  const ratio = (pointCount - 20) / 80;
  const width = 1.8 - ratio;
  return Number(width.toFixed(2));
}

function getAdaptivePointSize(pointCount: number) {
  if (!Number.isFinite(pointCount) || pointCount <= 0) {
    return 0.7;
  }

  if (pointCount <= 20) {
    return 0.7;
  }

  if (pointCount >= 100) {
    return 0.36;
  }

  const ratio = (pointCount - 20) / 80;
  const size = 0.7 - ratio * 0.34;
  return Number(size.toFixed(2));
}

function getAdaptivePointBorderWidth(pointCount: number) {
  if (!Number.isFinite(pointCount) || pointCount <= 0) {
    return 2;
  }

  if (pointCount <= 20) {
    return 2;
  }

  if (pointCount >= 100) {
    return 1;
  }

  const ratio = (pointCount - 20) / 80;
  const width = 2 - ratio;
  return Number(width.toFixed(2));
}

type CreateChartOptions = {
  showLines?: boolean;
  xPaddingPercent?: number;
  yPaddingPercent?: number;
  xLabelMaxVisible?: number;
  minValue?: number;
  maxValue?: number;
};

type NormalizedPoint = {
  index: number;
  label: string;
  value: number | null;
  valid: boolean;
  x: number;
  y: number;
};

type NormalizedDataset = {
  label: string;
  data: (number | null)[];
  lineColor?: string;
  showLines?: boolean;
  yAxis?: 'left' | 'right';
};

function createChartModel(labels: string[], values: (number | null)[], options: CreateChartOptions) {
  const showLines = options.showLines ?? true;
  const rawXPaddingInput = options.xPaddingPercent;
  const normalizedXPaddingPercent = Number.isFinite(rawXPaddingInput)
    ? rawXPaddingInput! > 1
      ? rawXPaddingInput! / 100
      : rawXPaddingInput!
    : 0;
  const xPaddingPercent = Math.max(0, Math.min(0.45, normalizedXPaddingPercent));
  const count = Math.max(labels.length, values.length);
  const parsedPoints: { index: number; label: string; value: number | null; valid: boolean }[] = [];

  for (let index = 0; index < count; index += 1) {
    const label = labels[index] ?? `item ${index + 1}`;
    const value = values[index];
    parsedPoints.push({
      index,
      label,
      value,
      valid: Number.isFinite(value)
    });
  }

  const validValues = parsedPoints.filter((point) => point.valid).map((point) => point.value) as number[];

  const providedMin = options.minValue;
  const providedMax = options.maxValue;
  const min = (Number.isFinite(providedMin) ? providedMin : Math.min(...validValues)) ?? 0;
  const max = (Number.isFinite(providedMax) ? providedMax : Math.max(...validValues)) ?? 0;
  const range = max - min;

  const normalized = parsedPoints.map((point, index) => {
    const x = parsedPoints.length === 1
      ? 50
      : xPaddingPercent * 100 + (index / (parsedPoints.length - 1)) * (100 - xPaddingPercent * 200);
    let y = NaN;
    if (point.valid) {
      y = range === 0 ? 50 : 100 - ((point.value! - min) / range) * 100;
    }
    return {
      ...point,
      x,
      y
    };
  });

  const validPoints = normalized.filter((point) => point.valid);

  if (validValues.length === 0) {
    return {
      count: 1,
      lineShape: 'none',
      linePoints: '',
      labelsHtml: '<li>No valid data points</li>',
      pointsHtml: ''
    };
  }

  const stroke = 3;
  let lineShape = 'none';
  let linePoints = '';
  let linePointSegments: string[] = [];
  if (showLines && validPoints.length >= 2) {
    const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
    const upper = validPoints.map(
      (point: NormalizedPoint) => `${point.x.toFixed(2)}% ${clampPercent(point.y! - stroke).toFixed(2)}%`
    );
    const lower = [...validPoints]
      .reverse()
      .map((point: NormalizedPoint) => `${point.x.toFixed(2)}% ${clampPercent(point.y! + stroke).toFixed(2)}%`);
    lineShape = `polygon(${[...upper, ...lower].join(', ')})`;
    linePoints = validPoints.map((point) => `${point.x.toFixed(2)},${point.y?.toFixed(2)}`).join(' ');


    const currentSegment: string[] = [];
    for (const point of normalized) {
      if (!point.valid) {
        if (currentSegment.length >= 2) {
          linePointSegments.push(currentSegment.join(' '));
        }
        currentSegment.length = 0;
        continue;
      }

      currentSegment.push(`${point.x.toFixed(2)},${point.y?.toFixed(2)}`);
    }

    if (currentSegment.length >= 2) {
      linePointSegments.push(currentSegment.join(' '));
    }
  }

  const labelsHtml = normalized
    .map(
      (point) => html`<li class="$${point.valid ? '' : 'is-missing'}">${point.label} (${point.valid ? point.value : '—'})</li>`
    );

  const pointsHtml = normalized
    .filter((point) => point.valid)
    .map(
      (point) => html`<li style="--x:$${point.x.toFixed(2)}%; --y:$${point.y.toFixed(2)}%">
  <button
    class="point-btn"
    type="button"
    data-label="${point.label}"
    data-value="${point.value}"
    aria-label="${point.label}: ${point.value}"></button></li>`
    );

  return {
    count: normalized.length,
    validPointCount: validPoints.length,
    validPoints,
    lineShape,
    linePoints,
    linePointSegments,
    showLines,
    labelsHtml,
    pointsHtml
  };
}

const normalizeDatasets = ({ datasets, data, showLines }: ChartOptions): NormalizedDataset[] => {
  if (Array.isArray(datasets) && datasets.length > 0) {
    return datasets.map((dataset, index) => ({
      label: dataset?.label ? String(dataset.label) : `Series ${index + 1}`,
      data: Array.isArray(dataset?.data) ? dataset.data : [],
      lineColor: dataset?.lineColor,
      showLines: dataset?.showLines ?? showLines,
      yAxis: dataset?.yAxis,
    }));
  }

  return [
    {
      label: 'Series 1',
      data: Array.isArray(data) ? data : [],
      showLines
    }
  ];
};

const createSeriesHtml = (labels: string[], dataset: NormalizedDataset, index: number, scale: { minValue?: number; maxValue?: number; xPaddingPercent?: number } = {}, chartType: 'line' | 'bar' = 'line') => {
  const chart = createChartModel(labels, dataset.data, {
    showLines: dataset.showLines,
    minValue: scale.minValue,
    maxValue: scale.maxValue,
    xPaddingPercent: scale.xPaddingPercent,
  });
  const seriesColor = dataset.lineColor ? String(dataset.lineColor) : 'rgb(29 78 216)';
  const pointSize = getAdaptivePointSize(chart.validPointCount!);
  const pointBorderWidth = getAdaptivePointBorderWidth(chart.validPointCount!);
  const colorStyle = html`--line-color:${seriesColor}; --point-size:${pointSize}rem; --point-border-width:${pointBorderWidth}px;`;

  let svgContent;
  if (chartType === 'bar') {
    const minValue = scale.minValue ?? 0;
    const maxValue = scale.maxValue ?? 0;
    const range = maxValue - minValue;
    const baselineY = range > 0 ? Math.min(100, Math.max(0, 100 - ((0 - minValue) / range) * 100)) : 100;
    const count = chart.count;
    const xPad = scale.xPaddingPercent ?? 0;
    const usableWidth = 100 - 2 * xPad * 100;
    const barWidth = count > 1 ? (usableWidth / (count - 1)) * 0.85 : Math.min(10, usableWidth * 0.8);

    svgContent = (chart.validPoints as NormalizedPoint[]).map(
      (point) => {
        const barHeight = Math.max(0, baselineY - point.y);
        const barX = point.x - barWidth / 2;
        return html`<rect class="bar-segment" x="${barX.toFixed(2)}" y="${point.y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${seriesColor}" opacity="0.8" pointer-events="auto" cursor="pointer" data-label="${point.label}" data-value="${point.value}"/>`;
      }
    );
  } else {
    const strokeWidth = getAdaptiveStrokeWidth(chart.validPointCount!);
    svgContent =
      chart.showLines && Array.isArray(chart.linePointSegments)
        ? chart.linePointSegments
          .map(
            (points: string) =>
              html`<polyline class="series-line-shape" points="${points}" stroke="${seriesColor}" fill="none" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"></polyline>`
          )
        : null;
  }

  const pointsHtml = chartType !== 'bar' ? html`<ol class="points" aria-hidden="true">$${chart.pointsHtml}</ol>` : '';

  return {
    model: chart,
    html: html`
      <div class="series" data-series-index="${index}" data-series-label="${dataset.label}" style="${colorStyle}">
        <svg class="series-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          $${svgContent}
        </svg>
        $${pointsHtml}
      </div>
    `
  };
};

const createLabelsHtml = (labels: string[], count: number, options: { maxVisibleLabels?: number | string } = {}) => {
  const rawMaxVisible = Number.parseInt(options.maxVisibleLabels as string, 10);
  const maxVisibleLabels = Number.isFinite(rawMaxVisible) ? Math.max(2, rawMaxVisible) : 14;
  const step = count > maxVisibleLabels ? Math.ceil((count - 1) / (maxVisibleLabels - 1)) : 1;
  const items: ReturnType<typeof html>[] = [];

  for (let index = 0; index < count; index += 1) {
    const label = labels[index] ?? `item ${index + 1}`;
    const showLabel = step === 1 || index === 0 || index === count - 1 || index % step === 0;
    items.push(html`<li class="$${showLabel ? '' : 'is-sparse'}">${showLabel ? label : ''}</li>`);
  }

  return items
};

const createLegendHtml = (datasets: NormalizedDataset[]) => {
  if (!Array.isArray(datasets) || datasets.length === 0) {
    return null;
  }

  const items = datasets
    .map((dataset, index) => {
      const label = dataset?.label ? String(dataset.label) : `Series ${index + 1}`;
      const color = dataset?.lineColor ? String(dataset.lineColor) : 'rgb(29 78 216)';
      return html`<li><span class="legend-swatch" style="--legend-color:${color};"></span><span class="legend-label">${label}</span></li>`;
    })

  return html`<ol class="legend" aria-label="Chart series">${items}</ol>`;
};

type ChartOptions = {
  labels: string[];
  datasets?: {
    label?: string;
    data?: (number | null)[];
    lineColor?: string;
    showLines?: boolean;
    yAxis?: 'left' | 'right';
  }[];
  data?: (number | null)[];
  showLines?: boolean;
  chartType?: 'line' | 'bar';
  xPaddingPercent: number | string;
  yPaddingPercent?: number | string;
  xLabelMaxVisible?: number | string;
  yAxes?: {
    left?: { min?: number; max?: number; exactMin?: number; exactMax?: number };
    right?: { min?: number; max?: number; exactMin?: number; exactMax?: number };
  };
}

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

function computeAxisDomain(values: number[], axisConfig?: { min?: number; max?: number; exactMin?: number; exactMax?: number }): AxisDomain | null {
  if (values.length === 0) return null;

  let rawMin = Math.min(...values);
  let rawMax = Math.max(...values);

  if (Number.isFinite(axisConfig?.min)) rawMin = Math.min(rawMin, axisConfig!.min!);
  if (Number.isFinite(axisConfig?.max)) rawMax = Math.max(rawMax, axisConfig!.max!);

  const minLabel = Number.isFinite(axisConfig?.exactMin) ? axisConfig!.exactMin! : Math.floor(rawMin / 5) * 5;
  const maxLabel = Number.isFinite(axisConfig?.exactMax) ? axisConfig!.exactMax! : Math.ceil(rawMax / 5) * 5;
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
  const tickPos = (value: number) => domainRange > 0 ? clamp(100 - ((value - domain.minDomain) / domainRange) * 100) : 50;

  return html`
    <ol class="${cssClass}" aria-hidden="true">
      <li style="top:${tickPos(domain.maxLabel).toFixed(2)}%;">${formatAxisValue(domain.maxLabel)}</li>
      <li style="top:${tickPos(domain.midLabel).toFixed(2)}%;">${formatAxisValue(domain.midLabel)}</li>
      <li style="top:${tickPos(domain.minLabel).toFixed(2)}%;">${formatAxisValue(domain.minLabel)}</li>
    </ol>
  `;
}

export const createChartHtml = (targetId: string, labels: string[], options: ChartOptions = {
  labels: [],
  xPaddingPercent: 5
}) => {
  const normalizedLabels = Array.isArray(labels) ? labels : [];
  const normalizedDatasets = normalizeDatasets(options);
  const rawXPaddingInput = Number.parseFloat(options.xPaddingPercent as string);
  const normalizedXPaddingPercent = Number.isFinite(rawXPaddingInput)
    ? rawXPaddingInput > 1
      ? rawXPaddingInput / 100
      : rawXPaddingInput
    : 0.05;
  const xPaddingPercent = Math.max(0, Math.min(0.45, normalizedXPaddingPercent));
  const rawMaxVisibleLabels = Number.parseInt(options.xLabelMaxVisible as string, 10);
  const xLabelMaxVisible = Number.isFinite(rawMaxVisibleLabels) ? Math.max(2, rawMaxVisibleLabels) : 14;

  // Separate datasets by axis
  const hasRightAxis = normalizedDatasets.some(d => d.yAxis === 'right');
  const leftDatasets = normalizedDatasets.filter(d => (d.yAxis ?? 'left') === 'left');
  const rightDatasets = normalizedDatasets.filter(d => d.yAxis === 'right');

  const collectValues = (datasets: NormalizedDataset[]) =>
    datasets
      .flatMap(d => d.data)
      .map(v => Number.parseFloat(v as unknown as string))
      .filter(v => Number.isFinite(v));

  const leftDomain = computeAxisDomain(collectValues(leftDatasets), options.yAxes?.left);
  const rightDomain = hasRightAxis ? computeAxisDomain(collectValues(rightDatasets), options.yAxes?.right) : null;

  // If no left datasets, fall back to right domain for the single-axis case
  const primaryDomain = leftDomain ?? rightDomain;

  const makeScale = (domain: AxisDomain | null) =>
    domain ? { minValue: domain.minDomain, maxValue: domain.maxDomain, xPaddingPercent } : {};

  const leftScale = makeScale(leftDomain);
  const rightScale = makeScale(rightDomain);

  const chartType = options.chartType ?? 'line';
  const series = normalizedDatasets.map((dataset, index) => {
    const scale = dataset.yAxis === 'right' ? rightScale : leftScale;
    return createSeriesHtml(normalizedLabels, dataset, index, scale, chartType);
  });

  const leftYAxisHtml = leftDomain ? makeYAxisHtml(leftDomain, 'y-axis') : '';
  const rightYAxisHtml = rightDomain ? makeYAxisHtml(rightDomain, 'y-axis y-axis-right') : '';

  const maxDataCount = normalizedDatasets.reduce((max, d) => Math.max(max, d.data.length), 0);
  const count = Math.max(normalizedLabels.length, maxDataCount, 1);
  const shouldAngleLabels = count > 14;
  const labelsHtml = createLabelsHtml(normalizedLabels, count, { maxVisibleLabels: xLabelMaxVisible });
  const legendHtml = createLegendHtml(normalizedDatasets);
  const style = `--count:${count}; --x-padding:${(xPaddingPercent * 100).toFixed(2)}%;`;
  const seriesHtml = series.map((item) => item.html);

  return html`
    <section id="${targetId}" class="chart" aria-label="Chart" style="${style}">
      <div class="plot">
        ${leftYAxisHtml}
        ${rightYAxisHtml}
        ${seriesHtml}
      </div>
      ${legendHtml}
      <ol class="labels$${shouldAngleLabels ? ' labels-angled' : ''}">${labelsHtml}</ol>
      <div class="point-popover" popover="manual"></div>
    </section>
  `;
};
