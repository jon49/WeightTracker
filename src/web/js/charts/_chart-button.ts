customElements.define("chart-button",
class extends HTMLElement {
    constructor() {
        super()
        this.addEventListener("click", this)
    }

    handleEvent(event: Event) {
        event.preventDefault()
        event.stopPropagation()
        this.createChart()
    }

    createChart() {
        let chart = this.dataset.chart
        if (!chart) {
            console.warn(`No chart specified.`)
            return
        }
        let target = document.querySelector(this.dataset.target ?? "")
        if (!target) {
            console.warn(`No chart target specified.`)
            return
        }
        target.prepend(document.createElement(chart))
        this.remove()
    }
})
