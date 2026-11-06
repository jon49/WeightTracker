// Draws the charts the charts page adds, each on one canvas, the way the
// native client does (native/chart_view.v): grid and axes, lines or grouped
// bars, a tooltip for the point nearest the pointer, and a strip under the
// plot showing the whole chart and which part of it is on show. Drag the
// strip's window to move it, or its edges to zoom; press beside it to move
// it there; drag a zoomed plot sideways to pan. The fields under the strip
// set the first and last label on show. With the canvas focused, the arrow
// keys step through the points.

import {
  type AxisScale,
  type ChartData,
  type ChartWindow,
  type Series,
  axisScale,
  formatAxis,
  keepWindow,
  labelIndex,
  moveWindow,
  setWindow,
  slice,
  ticks,
  windowRange,
} from "./_chart-model.js";

// The native client's palettes (native/gui/theme.v).
const themes = {
  light: {
    surface: "#eff0f1",
    border: "#c5c8ca",
    text: "#27292b",
    muted: "#616366",
    primary: "#5c5be0",
    tooltipBg: "#111827",
    tooltipText: "#ffffff",
  },
  dark: {
    surface: "#151618",
    border: "#2f3134",
    text: "#ced1d4",
    muted: "#8d8f92",
    primary: "#5c5be0",
    tooltipBg: "#2a2d33",
    tooltipText: "#ffffff",
  },
};
type Theme = (typeof themes)["light"];

function isDark() {
  const scheme = getComputedStyle(document.documentElement).colorScheme;
  if (scheme === "dark") return true;
  if (scheme === "light") return false;
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

const widen = (r: Rect, by: number) => ({ ...r, x: r.x - by, w: r.w + 2 * by });

const yOf = (a: AxisScale, v: number, r: Rect) => r.y + r.h - ((v - a.lo) / (a.hi - a.lo)) * r.h;

type DragPart = "plot" | "start" | "end" | "pan";

// What the last frame drew where, for the pointer.
interface Layout {
  plot: Rect;
  nav?: Rect;
  // The strip with room above and below to catch it.
  navArea?: Rect;
  // The size of a native pixel.
  scale: number;
  xs: number[];
  span: number;
  lo: number;
  hi: number;
}

const views = new Map<HTMLElement, ChartView>();

class ChartView {
  readonly section: HTMLElement;
  readonly data: ChartData;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly readout: HTMLElement | null;
  readonly from: HTMLInputElement | null;
  readonly to: HTMLInputElement | null;
  readonly resize: ResizeObserver;
  win: ChartWindow = { zoomed: false, lo: 0, hi: 0 };
  // Where the pointer is over the canvas, when it is.
  pointer: { x: number; y: number; touch: boolean } | null = null;
  // The point the arrow keys are on, as an index into the whole chart.
  cursor: number | null = null;
  drag: { part: DragPart; lo: number; hi: number; pressX: number } | null = null;
  layout: Layout | null = null;
  frame = 0;

  constructor(section: HTMLElement) {
    this.section = section;
    this.data = JSON.parse(section.dataset.chart!);
    this.canvas = section.querySelector("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.readout = section.querySelector(".chart-readout");
    this.from = section.querySelector(".chart-from");
    this.to = section.querySelector(".chart-to");

    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => this.onDown(e));
    c.addEventListener("pointermove", (e) => this.onMove(e));
    c.addEventListener("pointerup", () => this.onUp());
    c.addEventListener("pointercancel", () => this.onUp());
    c.addEventListener("pointerleave", (e) => {
      // A finger lifted leaves the tooltip where it was.
      if (e.pointerType === "touch" || this.drag) return;
      this.pointer = null;
      this.redraw();
    });
    c.addEventListener("keydown", (e) => this.onKey(e));
    c.addEventListener("blur", () => {
      this.cursor = null;
      this.redraw();
    });

    const n = this.data.labels.length;
    for (const input of [this.from, this.to]) {
      if (!input) continue;
      input.min = this.data.labels[0];
      input.max = this.data.labels[n - 1];
      input.addEventListener("change", () => this.onField(input));
    }
    section.querySelector(".chart-all")?.addEventListener("click", () => {
      this.win = { ...this.win, zoomed: false };
      this.redraw();
    });

    this.resize = new ResizeObserver(() => this.redraw());
    this.resize.observe(section);
  }

  destroy() {
    this.resize.disconnect();
    cancelAnimationFrame(this.frame);
  }

  redraw() {
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.draw();
      });
    }
  }

  get n() {
    return this.data.labels.length;
  }

  show(w: ChartWindow) {
    const [lo, hi] = windowRange(this.win, this.n);
    if (w.lo === lo && w.hi === hi && w.zoomed === this.win.zoomed) return;
    this.win = w;
    this.redraw();
  }

  // ---- input ----

  at(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // indexAt returns the label of the whole chart at x along the strip.
  indexAt(x: number) {
    const nav = this.layout!.nav!;
    return ((x - nav.x) / nav.w) * (this.n - 1);
  }

  onDown(e: PointerEvent) {
    const l = this.layout;
    if (!l || e.button > 0) return;
    const { x, y } = this.at(e);
    const touch = e.pointerType === "touch";
    this.pointer = { x, y, touch };
    // Edges are easier to catch with a finger when they reach further.
    const reach = (touch ? 22 : 8) * l.scale;
    const { lo, hi } = l;
    if (l.nav && l.navArea && contains(widen(l.navArea, reach), x, y)) {
      const wx0 = l.nav.x + (lo / (this.n - 1)) * l.nav.w;
      const wx1 = l.nav.x + (hi / (this.n - 1)) * l.nav.w;
      const d0 = Math.abs(x - wx0);
      const d1 = Math.abs(x - wx1);
      const part: DragPart =
        d0 <= reach && (d0 < d1 || x < wx0) ? "start" : d1 <= reach ? "end" : "pan";
      let [l0, h0] = [lo, hi];
      if (part === "pan" && (x < wx0 || x > wx1)) {
        // Pressed beside the window: move it there.
        l0 = Math.round(this.indexAt(x) - (hi - lo) / 2);
        this.show(moveWindow(this.n, l0, l0 + hi - lo));
        [l0, h0] = windowRange(this.win, this.n);
      }
      this.drag = { part, lo: l0, hi: h0, pressX: x };
    } else if (contains(l.plot, x, y) && hi - lo < this.n - 1) {
      this.drag = { part: "plot", lo, hi, pressX: x };
    } else {
      this.redraw();
      return;
    }
    this.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    this.redraw();
  }

  onMove(e: PointerEvent) {
    const { x, y } = this.at(e);
    this.pointer = { x, y, touch: e.pointerType === "touch" };
    const d = this.drag;
    const l = this.layout;
    if (d && l) {
      if (d.part === "plot") {
        const shift = Math.round(((d.pressX - x) / l.span) * (d.hi - d.lo));
        this.show(moveWindow(this.n, d.lo + shift, d.hi + shift));
      } else {
        const i = Math.round(this.indexAt(x));
        if (d.part === "start") {
          this.show(setWindow(this.n, Math.min(i, d.hi - 1), d.hi));
        } else if (d.part === "end") {
          this.show(setWindow(this.n, d.lo, Math.max(i, d.lo + 1)));
        } else {
          const shift = Math.round(this.indexAt(x) - this.indexAt(d.pressX));
          this.show(moveWindow(this.n, d.lo + shift, d.hi + shift));
        }
      }
    }
    if (l) {
      const zoomed = l.hi - l.lo < this.n - 1;
      const onNav = l.navArea && contains(widen(l.navArea, 8 * l.scale), x, y);
      this.canvas.style.cursor = d
        ? d.part === "plot"
          ? "grabbing"
          : "ew-resize"
        : onNav
          ? "ew-resize"
          : zoomed && contains(l.plot, x, y)
            ? "grab"
            : "";
    }
    this.redraw();
  }

  onUp() {
    if (!this.drag) return;
    this.drag = null;
    this.redraw();
  }

  onKey(e: KeyboardEvent) {
    const n = this.n;
    const [lo, hi] = windowRange(this.win, n);
    let i = this.cursor ?? hi;
    if (e.key === "ArrowLeft") i = this.cursor == null ? hi : i - 1;
    else if (e.key === "ArrowRight") i = this.cursor == null ? lo : i + 1;
    else if (e.key === "Home") i = lo;
    else if (e.key === "End") i = hi;
    else if (e.key === "Escape") {
      this.cursor = null;
      this.redraw();
      return;
    } else return;
    e.preventDefault();
    i = Math.max(0, Math.min(n - 1, i));
    this.cursor = i;
    // Stepping past the window's edge moves the window along.
    if (i < lo) this.show(moveWindow(n, i, i + hi - lo));
    if (i > hi) this.show(moveWindow(n, i - (hi - lo), i));
    if (this.readout) this.readout.textContent = tooltipLines(this.data, i).join(", ");
    this.redraw();
  }

  onField(input: HTMLInputElement) {
    const [lo, hi] = windowRange(this.win, this.n);
    const key = input.value.trim();
    if (key) {
      const i = labelIndex(this.data, key);
      this.show(input === this.from ? setWindow(this.n, i, hi) : setWindow(this.n, lo, i));
    }
    // Put back the label the window starts or ends at.
    this.syncFields(true);
  }

  syncFields(force = false) {
    const [lo, hi] = windowRange(this.win, this.n);
    for (const [input, i] of [
      [this.from, lo],
      [this.to, hi],
    ] as const) {
      if (input && (force || document.activeElement !== input)) {
        input.value = this.data.labels[i];
      }
    }
  }

  // ---- drawing ----

  draw() {
    const canvas = this.canvas;
    const w = canvas.clientWidth;
    if (!w) return;
    const ctx = this.ctx;
    const t = isDark() ? themes.dark : themes.light;
    // The native sizes are for a 16px font.
    const s = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
    const family = getComputedStyle(canvas).fontFamily;
    const font = (size: number) => `${size * s}px ${family}`;
    const lineHeight = (size: number) => size * s * 1.35;

    const full = this.data;
    const [lo, hi] = windowRange(this.win, full.labels.length);
    const c = hi - lo < full.labels.length - 1 ? slice(full, lo, hi) : full;
    const lh = lineHeight(12);
    const left = axisScale(c, false) ?? { lo: 0, hi: 1, step: 0.25 };
    const right = c.series.some((x) => x.rightAxis) ? axisScale(c, true) : undefined;

    // Axis label widths decide the plot's margins.
    ctx.font = font(12);
    const widest = (a: AxisScale) =>
      Math.max(0, ...ticks(a).map((v) => ctx.measureText(formatAxis(v)).width));
    const lw = widest(left);
    const rw = right ? widest(right) : 0;
    const gap = 10 * s;
    const plotH = Math.min((w * 9) / 16, 420 * s);
    const plot: Rect = {
      x: lw + gap,
      y: lh / 2,
      w: w - lw - gap - (rw > 0 ? rw + gap : 0),
      h: plotH,
    };
    const labelsY = plot.y + plot.h + 6 * s;
    const showNav = full.labels.length >= 3;
    const navH = 32 * s;
    const navY = labelsY + lh + 10 * s;
    const height = Math.ceil(showNav ? navY + navH + 2 : labelsY + lh + 2);

    // Size the canvas to its box, at the screen's resolution.
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(w * dpr);
    const bh = Math.round(height * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);

    rounded(ctx, plot, 6 * s, t.surface);

    // Grid and y axis labels.
    ctx.font = font(12);
    ctx.fillStyle = t.muted;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    for (const v of ticks(left)) {
      const gy = yOf(left, v, plot);
      ctx.fillStyle = t.border;
      ctx.fillRect(plot.x, gy - 0.5, plot.w, 1);
      ctx.fillStyle = t.muted;
      ctx.fillText(formatAxis(v), plot.x - 6 * s, gy);
    }
    if (right) {
      ctx.textAlign = "left";
      for (const v of ticks(right)) {
        ctx.fillText(formatAxis(v), plot.x + plot.w + 6 * s, yOf(right, v, plot));
      }
    }

    const n = c.labels.length;
    const padX = plot.w * 0.03;
    const xs = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      xs[i] = n === 1 ? plot.x + plot.w / 2 : plot.x + padX + (i / (n - 1)) * (plot.w - 2 * padX);
    }
    const scaleFor = (x: Series) => (x.rightAxis && right ? right : left);

    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.clip();
    if (c.style === "bar") {
      const slot = n > 1 ? (plot.w - 2 * padX) / (n - 1) : plot.w / 2;
      const groupW = slot * 0.8;
      const barW = groupW / c.series.length;
      c.series.forEach((x, si) => {
        const sc = scaleFor(x);
        const base = yOf(sc, Math.max(sc.lo, Math.min(0, sc.hi)), plot);
        ctx.fillStyle = x.color;
        x.values.forEach((val, i) => {
          if (val == null) return;
          const vy = yOf(sc, val, plot);
          const bx = xs[i] - groupW / 2 + si * barW;
          ctx.fillRect(bx, Math.min(vy, base), Math.max(barW - 1, 1), Math.abs(base - vy));
        });
      });
    } else {
      const dot = n <= 160;
      const lines = n < 500;
      ctx.lineWidth = (n > 100 ? 1.5 : 2.5) * s;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const x of c.series) {
        const sc = scaleFor(x);
        if (lines) {
          ctx.strokeStyle = x.color;
          ctx.beginPath();
          let joined = false;
          x.values.forEach((val, i) => {
            if (val == null) {
              joined = false;
              return;
            }
            const vy = yOf(sc, val, plot);
            if (joined) ctx.lineTo(xs[i], vy);
            else ctx.moveTo(xs[i], vy);
            joined = true;
          });
          ctx.stroke();
        }
        if (x.hidePoints) continue;
        if (dot) {
          circles(ctx, xs, x.values, sc, plot, 4 * s, x.color);
          circles(ctx, xs, x.values, sc, plot, 2 * s, t.surface);
        } else if (!lines) {
          circles(ctx, xs, x.values, sc, plot, 1.6 * s, x.color);
        }
      }
    }
    ctx.restore();

    // X labels, skipping some so they do not overlap.
    if (n > 0) {
      ctx.font = font(12);
      ctx.fillStyle = t.muted;
      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      const labelW = ctx.measureText(c.labels[0]).width + 16 * s;
      const maxLabels = Math.max(1, Math.floor(plot.w / labelW));
      const stride = Math.ceil(n / maxLabels);
      for (let i = 0; i < n; i += stride) {
        const half = ctx.measureText(c.labels[i]).width / 2;
        ctx.fillText(c.labels[i], Math.max(half, Math.min(w - half, xs[i])), labelsY);
      }
    }

    const layout: Layout = { plot, scale: s, xs, span: plot.w - 2 * padX, lo, hi };
    if (showNav) {
      const nav: Rect = { x: plot.x, y: navY, w: plot.w, h: navH };
      layout.nav = nav;
      layout.navArea = { x: nav.x, y: nav.y - 8 * s, w: nav.w, h: nav.h + 16 * s };
      this.drawRange(t, s, nav, lo, hi);
    }
    this.layout = layout;
    this.syncFields();

    // Tooltip for the point nearest the pointer, or the arrow keys' point.
    let best = -1;
    let mx = 0;
    let my = 0;
    const p = this.pointer;
    if (this.cursor != null && this.cursor >= lo && this.cursor <= hi) {
      best = this.cursor - lo;
      mx = xs[best];
      my = plot.y + plot.h / 2;
    } else if (p && contains(plot, p.x, p.y) && n > 0 && !this.drag) {
      best = 0;
      for (let i = 1; i < n; i++) {
        if (Math.abs(xs[i] - p.x) < Math.abs(xs[best] - p.x)) best = i;
      }
      mx = p.x;
      my = p.y;
    }
    if (best >= 0) this.drawTooltip(t, s, font, lineHeight, c, best, xs[best], mx, my, plot);
  }

  // drawRange draws the strip under the plot: the whole chart in
  // miniature, joined across gaps, with the part not on show shaded.
  drawRange(t: Theme, s: number, nav: Rect, lo: number, hi: number) {
    const ctx = this.ctx;
    const full = this.data;
    const n = full.labels.length;
    const atX = (i: number) => nav.x + (i / (n - 1)) * nav.w;
    rounded(ctx, nav, 6 * s, t.surface);
    const left = axisScale(full, false) ?? { lo: 0, hi: 1, step: 0.25 };
    const right = axisScale(full, true) ?? left;
    const inner = { x: nav.x, y: nav.y + 5 * s, w: nav.w, h: nav.h - 10 * s };
    ctx.save();
    ctx.beginPath();
    ctx.rect(nav.x, nav.y, nav.w, nav.h);
    ctx.clip();
    ctx.lineWidth = 1;
    for (const x of full.series) {
      const sc = x.rightAxis ? right : left;
      ctx.strokeStyle = x.color;
      ctx.beginPath();
      let joined = false;
      x.values.forEach((val, i) => {
        if (val == null) return;
        const vy = yOf(sc, val, inner);
        if (joined) ctx.lineTo(atX(i), vy);
        else ctx.moveTo(atX(i), vy);
        joined = true;
      });
      ctx.stroke();
    }
    const wx0 = atX(lo);
    const wx1 = atX(hi);
    ctx.fillStyle = "rgb(128 128 128 / 0.35)";
    ctx.fillRect(nav.x, nav.y, wx0 - nav.x, nav.h);
    ctx.fillRect(wx1, nav.y, nav.x + nav.w - wx1, nav.h);
    ctx.restore();
    for (const ex of [wx0, wx1]) {
      ctx.fillStyle = t.primary;
      ctx.fillRect(ex - 1 * s, nav.y, 2 * s, nav.h);
      rounded(
        ctx,
        { x: ex - 4 * s, y: nav.y + nav.h / 2 - 9 * s, w: 8 * s, h: 18 * s },
        3 * s,
        t.primary,
      );
    }
  }

  drawTooltip(
    t: Theme,
    s: number,
    font: (size: number) => string,
    lineHeight: (size: number) => number,
    c: ChartData,
    best: number,
    px: number,
    mx: number,
    my: number,
    plot: Rect,
  ) {
    const ctx = this.ctx;
    ctx.fillStyle = t.muted;
    ctx.fillRect(px, plot.y, 1, plot.h);
    const lines = [c.labels[best]];
    const colors = [t.tooltipText];
    for (const x of c.series) {
      const val = x.values[best];
      if (val != null) {
        lines.push(`${x.label}: ${formatAxis(val)}`);
        colors.push(x.color);
      }
    }
    ctx.font = font(13);
    const tlh = lineHeight(13);
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20 * s;
    const th = lines.length * tlh + 12 * s;
    let tx = mx + 14 * s;
    if (tx + tw > plot.x + plot.w) tx = mx - 14 * s - tw;
    tx = Math.max(tx, 0);
    const ty = Math.max(plot.y, Math.min(my - th / 2, plot.y + plot.h - th));
    rounded(ctx, { x: tx, y: ty, w: tw, h: th }, 6 * s, t.tooltipBg);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    lines.forEach((l, i) => {
      const cy = ty + 6 * s + i * tlh + tlh / 2;
      if (i > 0) {
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.arc(tx + 8 * s, cy, 3 * s, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.fillStyle = t.tooltipText;
      ctx.fillText(l, tx + (i > 0 ? 14 : 8) * s, cy);
    });
  }
}

// tooltipLines reads out label i of a chart: its label and each value.
function tooltipLines(c: ChartData, i: number) {
  const lines = [c.labels[i]];
  for (const x of c.series) {
    const val = x.values[i];
    if (val != null) lines.push(`${x.label}: ${formatAxis(val)}`);
  }
  return lines;
}

function rounded(ctx: CanvasRenderingContext2D, r: Rect, radius: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.fill();
}

// circles fills a circle at each value, in one path.
function circles(
  ctx: CanvasRenderingContext2D,
  xs: number[],
  values: (number | null)[],
  sc: AxisScale,
  plot: Rect,
  radius: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  values.forEach((val, i) => {
    if (val == null) return;
    const y = yOf(sc, val, plot);
    ctx.moveTo(xs[i] + radius, y);
    ctx.arc(xs[i], y, radius, 0, 2 * Math.PI);
  });
  ctx.fill();
}

// ---- the charts on the page ----

// mount draws the charts added since it last ran, and forgets the ones
// gone. A chart redrawn with new data (the chart period changed) keeps the
// part on show, as the native client does. The page's buttons show which
// charts are open.
function mount() {
  const gone = new Map<string, ChartView>();
  for (const [section, view] of views) {
    if (!section.isConnected) {
      view.destroy();
      views.delete(section);
      gone.set(section.id, view);
    }
  }
  for (const section of document.querySelectorAll<HTMLElement>(".chart[data-chart]")) {
    if (views.has(section)) continue;
    const view = new ChartView(section);
    const old = gone.get(section.id);
    if (old) view.win = keepWindow(old.win, old.data.labels, view.data);
    views.set(section, view);
  }
  for (const button of document.querySelectorAll<HTMLElement>("[data-chart-id]")) {
    const open = !!document.getElementById(button.dataset.chartId!);
    delete button.dataset.loading;
    button.classList.toggle("outline", !open);
    button.setAttribute("aria-pressed", String(open));
  }
}

function redrawAll() {
  for (const view of views.values()) view.redraw();
}

function closeChart(section: Element) {
  section.remove();
  mount();
}

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const close = target.closest(".chart-close");
  if (close) {
    const section = close.closest(".chart");
    if (section) closeChart(section);
    return;
  }
  // A chart's button closes it when it is open.
  const button = target.closest<HTMLElement>("[data-chart-id]");
  if (!button) return;
  const open = document.getElementById(button.dataset.chartId!);
  if (open) {
    e.preventDefault();
    closeChart(open);
  } else if (button.dataset.loading) {
    // Already on its way.
    e.preventDefault();
  } else {
    button.dataset.loading = "1";
  }
});

// A touch elsewhere puts away a tooltip a finger left.
document.addEventListener("pointerdown", (e) => {
  for (const view of views.values()) {
    if (view.pointer?.touch && e.target !== view.canvas) {
      view.pointer = null;
      view.redraw();
    }
  }
});

// Charts come in by htmz swaps, and a theme change comes back by one too.
document.addEventListener("hz:completed", () => {
  mount();
  redrawAll();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redrawAll);
mount();
