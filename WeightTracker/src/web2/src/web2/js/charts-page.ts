import { get, getMany, WeightData } from "./db.js"
import { avg, dateFill, reduceSlice, stdev } from "./utils.js"
import { getById } from "./dom-utils.js"
import "./lib/chart.min.js"
import { getWeeklyData, getStartDate, getChartSettings } from "./charts-shared.js"

const red = "#ff6384", blue = "#6391ff", green = "#63ff83"

const chartsLocation = getById("charts-location")

const chartFunc = {
    "chart-weight": weightData,
    "chart-weight-average": weightAverageChartData,
    "chart-histogram": histogram,
    "chart-sleep": sleep,
    "chart-rate": rate,
}

const charts = new Map()
const chartButtons = getById("create-chart")
chartButtons?.addEventListener("click", async ev => {
    let el = ev.target
    if (!el || !(el instanceof HTMLButtonElement)) return
    el.classList.add("hidden")
    const baseId = el.id.slice(0, -4)
    // @ts-ignore
    chartsLocation.prepend(getById(`${baseId}-template`).content.cloneNode(true))
    // @ts-ignore
    charts.set(baseId, new Chart(baseId, await chartFunc[baseId]()))
})

async function weightAverageChartData() {
    const { labels, maxValues, minValues, avgValues } = await getWeeklyData()

    const borderWidth = labels.length < 500 ? 2 : 1
    const pointRadius =
        labels.length < 500
            ? 2
        : labels.length > 750
            ? 1
        : 0
    const data = {
        labels,
        normalized: true,
        parsing: false,
        spanGaps: false,
        datasets: [ {
                label: "Max",
                data: maxValues,
                pointRadius,
                borderWidth,
                backgroundColor: red,
                borderColor: red
            }, {
                label: "Average",
                data: avgValues,
                pointRadius,
                borderWidth,
                backgroundColor: green,
                borderColor: green
            }, {
                label: "Min",
                data: minValues,
                pointRadius,
                borderWidth,
                backgroundColor: blue,
                borderColor: blue
            }
        ]
    }

    return {
        type: 'line',
        data,
        options: {}
    }
}

async function weightData() {
    const startDate = (await get("user-settings"))?.earliestDate
    if (!startDate) return
    const labels = dateFill(new Date(startDate), new Date())
    const rawValues = await getMany<WeightData|undefined>(labels)
    const values = rawValues.map(x => x?.weight || null)
    const pointRadius =
        labels.length < 500
            ? 2
        : 1
    const data = {
        labels: labels,
        normalized: true,
        parsing: false,
        spanGaps: false,
        datasets: [{
            label: "Weight",
            backgroundColor: red,
            borderColor: red,
            data: values,
            pointRadius,
            borderWidth: 1,
            showLine: labels.length < 500
        }]
    }
    const config = {
        type: 'line',
        data,
        options: {}
    }
    return config
}

async function histogram() {
    const startDate = (await get("user-settings"))?.earliestDate
    if (!startDate) return
    const rawValues = await getMany<(WeightData|undefined)>(dateFill(new Date(startDate), new Date()))
    const values = {}
    for (let val of rawValues) {
        let weight
        // @ts-ignore
        if (weight = val?.weight | 0) {
            // @ts-ignore
            values[weight] = (values[weight] | 0) + 1
        }
    }

    // Fill in missing values
    const keys = Object.keys(values)
    const length = +keys[keys.length - 1] - +keys[0] + 1
    const start = +keys[0]
    for (var i = 0; i < length; i++) {
        // @ts-ignore
        values[i + start] = values[i + start] ?? 0
    }

    const data = {
        normalized: true,
        parsing: false,
        spanGaps: false,
        datasets: [{
            label: "Weight (Count)",
            backgroundColor: red,
            borderColor: red,
            data: values,
            borderWidth: 1,
        }]
    }
    const config = {
        type: 'bar',
        data,
        options: {}
    }
    return config
}

async function rate() {
    const chartSettings = await getChartSettings()
    const startDate = getStartDate(chartSettings.duration, chartSettings.durationUnit)
    const dates = dateFill(startDate, new Date())
    const rawValues = await getMany<WeightData|undefined>(dates)
    const averages = reduceSlice(dates, 7, (acc, val, index) => {
        if (acc.date) return acc
        acc.date = val
        const v =
            <number[]>rawValues.slice(index, index + 7)
            .map(x => x?.weight)
        acc.avg = avg(v) || null
        return acc
    }, () => <{ date: string, avg: number | null }>({}))
    const length = averages.length
    const values: { x?: string, pos?: number|null, neg?: number|null, avgAll?: number, avgNeg?: number }[] = new Array(length - 1)
    let allTotal = 0
    let negTotal = 0
    let count = 0
    for (let index = 1; index < length; index++) {
        const first = averages[index - 1]
        const last = averages[index]
        let pos = null, neg = null
        if (first.avg && last.avg) {
            count++
            const diff = last.avg - first.avg
            diff > 0 ? (pos = diff, allTotal += diff) : (neg = diff, allTotal += diff, negTotal += diff)
        }
        values[index - 1] = { pos, neg, x: last.date }
    }

    const pointRadius = 0
    const data = {
        labels: values.map(x => x.x),
        normalized: true,
        parsing: false,
        spanGaps: false,
        datasets: [{
            label: "Weight Gained",
            backgroundColor: blue,
            borderColor: blue,
            data: values.map(x => x.pos),
            borderWidth: 1,
        }, {
            label: "Weight Lost",
            backgroundColor: red,
            borderColor: red,
            data: values.map(x => x.neg),
            borderWidth: 1,
        }, {
            label: "Overall Weight Change",
            backgroundColor: green,
            borderColor: green,
            data: new Array(length - 1).fill(allTotal/(count||1)),
            borderWidth: 1,
            pointRadius,
        }, {
            label: "Overall Weight Loss",
            backgroundColor: red,
            borderColor: red,
            data: new Array(length - 1).fill(negTotal/(count||1)),
            borderWidth: 1,
            pointRadius,
        }]
    }
    return {
        type: "line",
        data,
        options: {}
    }
}

async function sleep() {
    const chartSettings = await getChartSettings()
    const startDate = getStartDate(chartSettings.duration, chartSettings.durationUnit)
    const dates = dateFill(startDate, new Date())
    const rawValues = await getMany<WeightData|undefined>(dates)
    const values = reduceSlice(dates, 7, (acc, val, index) => {
        if (acc.date) return acc
        acc.date = val
        const v = rawValues.slice(index, index + 7).map(x => x?.sleep)
        acc.avg = avg(v) || null
        acc.std = stdev(v) || null
        return acc
    }, () => <{ date: string|null, avg: number|null, std: number|null }>({}))

    const labels = values.map(x => x.date)
    const data = {
        labels: labels,
        normalized: true,
        parsing: false,
        spanGaps: false,
        datasets: [{
            label: "Average Sleep for Week",
            backgroundColor: red,
            borderColor: red,
            data: values.map(x => x.avg),
            borderWidth: 1,
            yAxisID: "A",
        }, {
            label: "Standard Deviation",
            backgroundColor: green,
            borderColor: green,
            data: values.map(x => x.std),
            borderWidth: 1,
            yAxisID: "B",
        }]
    }

    return {
        type: "line",
        data,
        options: {
            scales: {
                A: {
                    position: 'left',
                    suggestedMin: 0,
                },
                B: {
                    position: 'right',
                    suggestedMin: 0,
                },
            }
        }
    }
}
