import { ChartSettings, UserSettings, WeightData } from "../server/db.js"
import { avg, dateFill, dateToString, reduceSlice, stdev } from "./utils.js"
import { getWeeklyData, getStartDate, setChartSettingDefaults } from "./charts-shared.js"
import "./charts/_chart-button.js"
import { bedtimeSuccess, timeToNumber } from "./charts/_utils.js"

const red = "#ff6384", blue = "#6391ff", green = "#63ff83"

class HistoryChart extends HTMLElement {
    chart: any | undefined | null
    constructor() {
        super()
        createChart(this, weightData())
    }

    disconnectedCallback() {
        cleanUp(this)
    }
}

customElements.define("chart-history", HistoryChart)

class AverageChart extends HTMLElement {
    chart: any | undefined | null
    constructor() {
        super()
        createChart(this, weightAverageChartData())
    }

    disconnectedCallback() {
        cleanUp(this)
    }
}

customElements.define("chart-average", AverageChart)

class HistogramChart extends HTMLElement {
    chart: any | undefined | null
    constructor() {
        super()
        createChart(this, histogram())
    }

    disconnectedCallback() {
        cleanUp(this)
    }
}

customElements.define("chart-histogram", HistogramChart)

class BedtimeChart extends HTMLElement {
    chart: any | undefined | null
    constructor() {
        super()
        createChart(this, bedtime())
    }

    disconnectedCallback() {
        cleanUp(this)
    }
}

customElements.define("chart-bedtime", BedtimeChart)

class SleepChart extends HTMLElement {
    chart: any | undefined | null
    constructor() {
        super()
        createChart(this, sleep())
    }

    disconnectedCallback() {
        cleanUp(this)
    }
}

customElements.define("chart-sleep", SleepChart)

class RateChart extends HTMLElement {
    chart: any | undefined | null
    constructor() {
        super()
        createChart(this, rate())
    }

    disconnectedCallback() {
        cleanUp(this)
    }
}

customElements.define("chart-rate", RateChart)

function createChart(ctx: HTMLElement & { chart?: any }, config: Promise<any>) {
    config.then(config => {
        if (!config) return
        let div = document.createElement("div")
        div.innerHTML = `<canvas></canvas>`
        div.classList.add("t-pad")
        ctx.append(div)
        // @ts-ignore
        ctx.chart = new Chart(div.firstElementChild, config)
    })
}

function cleanUp(ctx: { chart?: any }) {
    ctx.chart?.destroy()
    ctx.chart = null
}

async function weightAverageChartData() {
    let chartSettings = await getChartSettings()
    const weeklyData =
        await getWeeklyData(
            chartSettings,
            getWeightData)
    if (!weeklyData) return
    const { labels, maxValues, minValues, avgValues } = weeklyData

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
        datasets: [{
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
    const startDate = (await api<UserSettings>("user-settings"))?.earliestDate
    if (!startDate) return
    const labels = dateFill(new Date(startDate), new Date())
    const rawValues = await getWeightData(startDate)
    if (!rawValues) return
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
    const startDate = (await api<UserSettings>("user-settings"))?.earliestDate
    if (!startDate) return
    const rawValues = await getWeightData(startDate)
    if (!rawValues) return
    const values: any = {}
    for (let val of rawValues) {
        let weight
        if (weight = (val?.weight || 0) | 0) {
            values[weight] = (values[weight] | 0) + 1
        }
    }

    // Fill in missing values
    const keys = Object.keys(values)
    const length = +keys[keys.length - 1] - +keys[0] + 1
    const start = +keys[0]
    for (var i = 0; i < length; i++) {
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
    const rawValues = await getWeightData(startDate)
    if (!rawValues) return
    const averages = reduceSlice(dates, 7, (acc, val, index) => {
        if (acc.date) return acc
        acc.date = val
        const v =
            <number[]>rawValues.slice(index, index + 7)
                .filter(x => x?.weight)
                .map(x => x?.weight)
        acc.avg = avg(v) || null
        return acc
    }, () => <{ date: string, avg: number | null }>({}))
    const length = averages.length
    const values: { x?: string, pos?: number | null, neg?: number | null, avgAll?: number, avgNeg?: number }[] = new Array(length - 1)
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
            data: new Array(length - 1).fill(allTotal / (count || 1)),
            borderWidth: 1,
            pointRadius,
        }, {
            label: "Overall Weight Loss",
            backgroundColor: red,
            borderColor: red,
            data: new Array(length - 1).fill(negTotal / (count || 1)),
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

async function bedtime() {
    const bedtimeGoal = (await api<UserSettings>("user-settings"))?.bedtime
    const {duration, durationUnit} = await getChartSettings()
    const startDate = getStartDate(duration, durationUnit)
    const dates = dateFill(startDate, new Date())
    const rawValues = await getWeightData(startDate)
    if (!rawValues) return

    const values = reduceSlice(dates, 7, (acc, val, index) => {
        if (acc.date) return acc
        acc.date = val
        const bedtimesForWeek = rawValues
            .slice(index, index + 7)
            .filter(x => x?.bedtime)
            .map(x => timeToNumber(x.bedtime as string))
        acc.std = stdev(bedtimesForWeek) || null
        acc.success = avg(bedtimeSuccess(bedtimesForWeek, timeToNumber(bedtimeGoal ?? "22:00"))) || null
        return acc
    }, () => <{ date: string | null, std: number | null, success: number | null }>({}))

    const labels = values.map(x => x.date)
    const data = {
        labels: labels,
        normalized: true,
        parsing: false,
        spanGaps: false,
        datasets: [{
            label: "Bedtime Success",
            backgroundColor: red,
            borderColor: red,
            data: values.map(x => x.success),
            borderWidth: 1,
            yAxisID: "A",
        }, {
            label: "Standard Deviation",
            backgroundColor: "rgba(0, 255, 0, 0.1)",
            borderColor: "rgba(0, 255, 0, 0.1)",
            data: values.map(x => x.std),
            borderWidth: 1,
            yAxisID: "B",
        }]
    }

    return {
        type: "bar",
        data,
        options: {
            scales: {
                A: {
                    position: 'left',
                    min: 0.5,
                },
                B: {
                    position: 'right',
                    suggestedMin: 0,
                },
            }
        }
    }
}

async function sleep() {
    const chartSettings = await getChartSettings()
    const startDate = getStartDate(chartSettings.duration, chartSettings.durationUnit)
    const dates = dateFill(startDate, new Date())
    const rawValues = await getWeightData(startDate)
    if (!rawValues) return
    const values = reduceSlice(dates, 7, (acc, val, index) => {
        if (acc.date) return acc
        acc.date = val
        const v = rawValues.slice(index, index + 7).map(x => x?.sleep)
        acc.avg = avg(v) || null
        acc.std = stdev(v) || null
        return acc
    }, () => <{ date: string | null, avg: number | null, std: number | null }>({}))

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

async function api<T>(url: string): Promise<T> {
    url = `/web/api/${url}`
    let res = await fetch(url)
    if (res.ok && res.headers.get("Content-Type") === "application/json") {
        let obj = await res.json()
        return <T>obj
    }
    console.error(res);
    return Promise.reject(res.statusText)
}

function getWeightData(start: string | Date) {
    let s = start instanceof Date ? dateToString(start) : start
    return api<WeightData[] | undefined>(`data?start=${s}`)
}

async function getChartSettings() {
    let chartSettings = await api<ChartSettings>("chart-settings")
    return setChartSettingDefaults(chartSettings)
}

