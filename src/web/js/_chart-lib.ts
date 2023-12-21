import { mount, svg, unmount, h } from "redom"

const leftMargin = 25
const bottomMargin = 25

interface PointLocation {
    values: string[],
    label: string,
    x: number | null,
    points: { x: number, ys: number[] },
    el: Element
}

export class Chart extends HTMLElement {
    chartConfig: ChartConfig
    chart: HTMLElement // SVGChartElement
    text: SVGGElement | undefined | null
    closestXIndex: number | undefined
    locations: PointLocation[] | undefined
    #closestEl: Element | undefined

    constructor(chartConfig: ChartConfig) {
        super()
        this.chartConfig = chartConfig
        this.chart = renderChart(chartConfig)
        this.addEventListener("mousemove", this)
        this.addEventListener("mouseleave", this)
        mount(this, this.chart)
    }

    disconnectedCallback() {
        unmount(this, this.chart)
    }

    handleEvent(e: Event) {
        // @ts-ignore
        this[`on${e.type}`](e);
    }

    // @ts-ignore
    onmouseleave(e: Event) {
        if (this.text) {
            // @ts-ignore
            // this.text.querySelector('text').textContent = ""
            // this.text.querySelector('rect')?.setAttribute("width", "0")
            this.#closestEl = undefined
        }
    }

    // @ts-ignore
    onmousemove(e: MouseEvent) {
        if (!this.locations) {
            let chart = this.closest('svg-chart')
            if (!chart) return
            let xOffset = chart.getBoundingClientRect().x
            this.locations = []
            for (let x of document.querySelectorAll("[data-value]")) {
                if (!(x instanceof SVGElement)) continue
                let value = x.dataset.value
                let label = x.dataset.label
                if (!value || !label) continue
                let g = x.closest("g")
                if (!g || !(g instanceof SVGGElement)) continue
                let match = g.getAttribute('transform')?.match(/translate\(([\d.-]+)\)/)
                let xLocation = match ? +match[1] : 0
                let existing = this.locations.find(x => x.label === label)
                if (existing) {
                    existing.values.push(value)
                    existing.points.ys.push(+(x.getAttribute("cy") || 0))
                    continue
                }
                this.locations.push({
                    values: [value],
                    label,
                    x: x.getBoundingClientRect().x - xOffset,
                    points: { x: xLocation, ys: [+(x.getAttribute("cy") || 0)] },
                    el: x
                })
            }
        }

        // Get the mouse coordinates relative to the SVG element
        var mouseX = e.clientX - this.getBoundingClientRect().left
        let closest: any = this.locations.reduce((acc, val) => {
            if (val.x == null || !val.values.length || !val.label) return acc
            let diff = Math.abs(val.x - mouseX)
            if (diff < acc.diff) {
                acc.diff = diff
                acc.location = val
            }
            return acc
        }, { diff: Infinity, location: null} as { diff: number, location: PointLocation | null })

        if (!isClosestMouse(closest)) return

        if (closest.location?.el && this.#closestEl === closest.location.el) return
        this.#closestEl = closest.location?.el

        if (!this.text) {
            // @ts-ignore
            this.text = this.chart.querySelector("#point-label")
            if (!this.text) return
        }

        closest.location.values
        .map((value, i) => {
            this.#updateCommentBox(closest, i, value)
        })
    }

    #updateCommentBox(closest: ClosestMouse, index: number, value: string) {
        let points = closest.location.points
        let label = closest.location.label

        let id = `comment-box-${index}`
        let commentBox = this.chart.querySelector(`#${id}`)
        if (!commentBox) {

        let text = this.text.querySelector('text')
        if (!text) return

        let padding = 5
        text.innerHTML = `<tspan>${label}</tspan>${
            closest.location.values
            .map((value, i) => `<tspan x="0" dy="${15 * (i + 1)}">${value}</tspan>`)
            .join("")}`
        let textBox = text.getBBox()

        // @ts-ignore
        this.text.setAttribute(
            "transform",
            `translate(${(points.x ?? 0).toFixed(2)},${(points.y - textBox.height).toFixed(2)})`)

        let rect = this.text.querySelector('rect')
        if (!rect) return
        for (let [name, val] of [
            ["x", (textBox.x - padding).toFixed(2)],
            ["y", (textBox.y - padding).toFixed(2)],
            ["width", (textBox.width + padding*2).toFixed(2)],
            ["height", (textBox.height + padding*2).toFixed(2)]
        ]) {
            rect.setAttribute(name, val)
        }
    }

}

// datasets.map(_ => svg("g#point-label",
//     svg("rect", { fill: "rgba(0,0,0,0.8)", rx: 5 }),
//     svg("text", { fill: "white", "font-size": 10, "text-anchor": "middle" })
// )),

class CommentBox {
    el: SVGGElement
    #rect: SVGRectElement
    #text: SVGTextElement

    constructor(index: number) {
        this.#rect = <SVGRectElement>svg("rect", { fill: "rgba(0,0,0,0.8)", rx: 5 })
        this.#text = <SVGTextElement>svg("text", { fill: "white", "font-size": 10, "text-anchor": "middle" })
        this.el = <SVGGElement>svg(`g#comment-box-${index}`, this.#rect, this.#text)
    }

    update({ x, y, label, value }: { label: string, x: number, y: number, value: string }) {
        let padding = 5
        this.#text.innerHTML = `<tspan>${label}</tspan><tspan x="0" dy="15">${value}</tspan>`
        let textBox = this.#text.getBBox()

        // @ts-ignore
        this.text.setAttribute(
            "transform",
            `translate(${x.toFixed(2)},${(y - textBox.height).toFixed(2)})`)

        for (let [name, val] of [
            ["x", (textBox.x - padding).toFixed(2)],
            ["y", (textBox.y - padding).toFixed(2)],
            ["width", (textBox.width + padding*2).toFixed(2)],
            ["height", (textBox.height + padding*2).toFixed(2)]
        ]) {
            this.#rect.setAttribute(name, val)
        }
    }
}

function isClosestMouse(val: any): val is ClosestMouse {
    return val && val.location && val.diff != null
}

interface ClosestMouse {
    location: PointLocation,
    diff: number
}

customElements.define("svg-chart", Chart)

// Possibly use a ratio of what the default font size is to the current font size
// let fontSize = window.getComputedStyle(document.body).fontSize
function renderChart(chartConfig: ChartConfig) {
    chartConfig.data.datasets = chartConfig.data.datasets.filter(x => x.values?.length)
    let { /*type,*/ data, height, width } = chartConfig
    height ??= 250
    width ??= 500
    // chartHeight = height - left margin - right margin
    let chartWidth = width - leftMargin - 10
    // chartHeight = height - top margin - bottom margin
    let chartHeight = height - 10 - bottomMargin

    let { datasets } = data
    let { max, min } = getChartYBoundariesStep(datasets)
    let getPoint = getPointGenerator({
        chartHeight,
        chartWidth,
        max,
        min,
        xCount: chartConfig.data.labels.length
    })

    let figCaption = h("figcaption.center.center-vertical")
    if (chartConfig.title) {
        figCaption.innerHTML = chartConfig.title
    }

    return h("figure",
    figCaption,
    svg("svg", { height, width },
        svg("g", { transform: "translate(50, 10)" },
            svg("g#core", { transform: `translate(0, ${chartHeight})` },
                yAxis({ getPoint, chartWidth, max, min, maxLabelWidth: 10 }),
                chart({ getPoint, chartHeight, chartWidth, datasets, max, min }),
                xAxis({ labels: chartConfig.data.labels, datasets, getPoint, chartHeight, chartWidth, max, min, maxLabelHeight: 15 }),
                datasets.map(_ => svg("g#point-label",
                    svg("rect", { fill: "rgba(0,0,0,0.8)", rx: 5 }),
                    svg("text", { fill: "white", "font-size": 10, "text-anchor": "middle" })
                )),
          ))))
}

interface GetPointGeneratorArgs {
    chartHeight: number
    chartWidth: number
    max: number
    min: number
    xCount: number
}
interface GetPoint {
    (x: number, y: MaybeNumber): { x: number, y: MaybeNumber }
}
function getPointGenerator({ chartHeight, chartWidth, max, min, xCount }: GetPointGeneratorArgs): GetPoint {
    let heightRatio = chartHeight / (max - min)
    let widthRatio = chartWidth / xCount
    return function getPoint(x: number, y: MaybeNumber) {
        return { x: widthRatio * x, y: y == null ? null : chartHeight - heightRatio * (max - y) }
    }
}

interface YAxisArgs {
    chartWidth: number
    maxLabelWidth: number
    max: number
    min: number
    getPoint: GetPoint
}
function yAxis({ max, min, chartWidth, getPoint, maxLabelWidth = 10 }: YAxisArgs) {
    let divisor = 5
    let count = (max - min) / divisor + 1
    return svg("g", { transform: `translate(-${maxLabelWidth + 5})` },
        Array(count).fill(0).map((_, i) =>
            svg("g", { transform: `translate(0, -${getPoint(0, i * 5 + min).y})` },
                svg("line", { x1: 10, x2: chartWidth, stroke: "lightgrey" }),
                svg("text", { "text-anchor": "end", dy: 3, "font-size": 10, fill: "grey" }, ""+(divisor * i + min)))
        )
    )
}


function xAxis({ getPoint, chartHeight, datasets, labels, maxLabelHeight }: ChartArgs & { maxLabelHeight?: number, labels: string[] }) {
    let lineLength = -chartHeight - 5
    return svg("g",
        labels.map((label, i) => {
            return svg("g", { transform: `translate(${getPoint(i, 0).x.toFixed(2)})` },
            svg("line", { y1: 5, y2: lineLength, stroke: "lightgrey" }),
            svg("text", {
                transform: `rotate(45, 5)`,
                "text-anchor": "middle",
                dy: maxLabelHeight,
                "font-size": 10,
                fill: "grey" },
            label),
            getCircles({ datasets, getPoint, index: i, label })
        )
    })
    )
}

interface GetCirclesArgs {
    datasets: ChartDataset[]
    getPoint: GetPoint
    index: number
    label: string
}
function getCircles({ datasets, getPoint, index: i, label }: GetCirclesArgs) {
    return datasets.map(dataset => {
        let { values } = dataset
        let value = values[i]
        let point = getPoint(i, value)
        if (point.y == null) {
            return null
        }
        return svg("circle.point", {
            "data-value": value,
            "data-label": label,
            fill: dataset.color ?? "steelblue",
            cy: `-${point.y.toFixed(2)}`,
            r: 3
        })
    }).flat()
}

interface ChartArgs {
    chartHeight: number
    chartWidth: number
    datasets: ChartDataset[]
    max: number
    min: number
    getPoint: GetPoint
}
function chart(o: ChartArgs) {
    return o.datasets.map(dataset => {
        if (dataset.type === "line") {
            return svg("g", lineChart({ ...o, dataset }))
        }
        return null
    }).flat()
}

interface Point {
    x: number
    y: MaybeNumber
}
function lineChart({ dataset, getPoint }: ChartArgs & { dataset: ChartDataset }) {
    // <!-- Line Chart -->
    let fragment = document.createDocumentFragment()
    let points: Point[] = []
    let { values, color } = dataset
    for (let i = 0; i < values.length; i++) {
        let point = getPoint(i, values[i])
        if (point.y == null) {
            if (points.length === 1) {
                // This will be done in the x-axis
                // fragment.append(renderCircle(points[0]))
            } else if (points.length > 1) {
                fragment.append(renderLine(points, color))
            }
            points.length = 0
            continue
        }
        points.push(point)
    }
    if (points.length) {
        fragment.append(renderLine(points, color))
    }
    return fragment
}

function renderLine(points: Point[], fill: string | undefined) {
    return svg("g", svg("polyline", {
        stroke: fill ?? "steelblue",
        fill: "none",
        points: points.map(x => `${x.x.toFixed(2)},-${x.y?.toFixed(2)}`).join(" ")
    }))
}

function getChartYBoundariesStep(datasets: ChartDataset[]) {
    let min =
        Math.floor(
            Math.min(
                ...datasets.map(
                    x => x.yMin
                    ?? Math.min(
                        ...x.values.filter(isNumber)))) / 5) * 5 - 5
    let max =
        Math.ceil(
            Math.max(
                ...datasets.map(
                    x => x.yMax
                    ?? Math.max(
                        ...x.values.filter(isNumber)))) / 5) * 5 + 5

    return {
        min,
        max,
    }
}

function isNumber(x: number | undefined | null): x is number {
    return x != null
}

export interface ChartConfig {
    data: ChartData
    height?: number
    width?: number
    title?: string
}

export interface ChartData {
    labels: string[]
    datasets: ChartDataset[]
}

type MaybeNumber = number | null | undefined

export interface ChartDataset {
    type: "line" | "bar" | "scatter"
    label?: string
    values: MaybeNumber[]
    color?: string
    fill?: string
    width?: number
    yMax?: number
    yMin?: number
}

