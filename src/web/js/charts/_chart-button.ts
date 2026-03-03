window.app.chartButton = (e, el) => {
  e.preventDefault()
  e.stopPropagation()

  let chart = el.dataset.chart;
  if (!chart) {
    console.warn(`No chart specified.`);
    return;
  }
  let target = document.getElementById("charts-location");
  if (!target) return;
  target.prepend(document.createElement(chart));
  el.remove();
}