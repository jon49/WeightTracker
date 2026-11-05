import type { ChartData } from "../../js/charts/_chart-model.js";

const { html } = self.sw;

// chartHtml is a chart's section: its data, which the charts page script
// (js/charts/_chart-view.ts) draws on the canvas, the fields for the part
// on show, and the legend. Without data it says there's not enough.
export function chartHtml(id: string, title: string, data: ChartData | undefined) {
  const head = html`
    <header class=chart-head>
      <h3>${title}</h3>
      <button type=button class=chart-close aria-label="Close the ${title} chart">&times;</button>
    </header>`;
  if (!data) {
    return html`
      <section id="${id}" class=chart>
        ${head}
        <p class=chart-empty>Not enough data for this chart yet.</p>
      </section>`;
  }
  // The histogram's labels are weights; the others', dates.
  const field = data.kind === "histogram" ? "number" : "date";
  const what = data.kind === "histogram" ? "weight" : "date";
  return html`
    <section id="${id}" class=chart data-chart="${JSON.stringify(data)}">
      ${head}
      <canvas class=chart-canvas tabindex=0 role=img
        aria-label="${title} chart. The arrow keys step through its values."></canvas>
      <p class="chart-readout visually-hidden" aria-live=polite></p>
      <div class=chart-range ${data.labels.length < 3 ? "hidden" : ""}>
        <span class=chart-fields>
          <input class=chart-from type=${field} aria-label="First ${what} on show">
          <span aria-hidden=true>&ndash;</span>
          <input class=chart-to type=${field} aria-label="Last ${what} on show">
        </span>
        <button type=button class="outline chart-all">Show all</button>
      </div>
      <ul class=legend>
        ${data.series.map((s) => html`<li style="--color:${s.color}">${s.label}</li>`)}
      </ul>
    </section>`;
}
