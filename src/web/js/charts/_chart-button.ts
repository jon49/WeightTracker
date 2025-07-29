// @ts-ignore
window.defineTrait("chart-button",
class {
    el: HTMLButtonElement
    constructor(el: HTMLButtonElement) {
        el.addEventListener("click", this)
        this.el = el
    }

    handleEvent(event: Event) {
        event.preventDefault()
        event.stopPropagation()
        this.createChart()
    }

    createChart() {
        let chart = this.el.dataset.chart
        if (!chart) {
            console.warn(`No chart specified.`)
            return
        }
        let target = document.getElementById("charts-location")
        if (!target) return
        target.prepend(document.createElement(chart))
        this.el.remove()
    }
})
