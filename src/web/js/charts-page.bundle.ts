import { ChartSettings, UserSettings, WeightData } from "../server/db.js"
import { avg, dateFill, dateToString, reduceSlice, stdev } from "./utils.js"
import { getById } from "./dom-utils.js"
import { getWeeklyData, getStartDate, setChartSettingDefaults } from "./charts-shared.js"
// @ts-ignore
import { Chart, ChartConfig, ChartData } from "./_chart-lib.js"

const red = "#ff6384", blue = "#6391ff", green = "#63ff83"

async function api<T>(url: string) : Promise<T> {
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

const chartsLocation = getById("charts-location")

const chartFunc = {
    "chart-weight": weightData,
    "chart-weight-average": weightAverageChartData,
    "chart-histogram": histogram,
    "chart-sleep": sleep,
    "chart-rate": rate,
}

// @ts-ignore
window.app.scripts.set("/web/js/charts-page.js", {
    load: () => {
        const chartButtons = getById("create-chart")
        chartButtons?.addEventListener("click", handleChartButtons)
    },
    unload: () => {
        const chartButtons = getById("create-chart")
        chartButtons?.removeEventListener("click", handleChartButtons)
    }
})

async function handleChartButtons(e: Event) {
    let el = e.target
    if (!chartsLocation || !(el instanceof HTMLButtonElement)) return
    el.remove()
    const baseId = el.id.slice(0, -4)
    // @ts-ignore
    let fn: any = chartFunc[baseId]
    if (!(fn instanceof Function)) {
        console.error("Unknown chart type", baseId)
        return
    }

    let config = await fn()
    config.height = 250
    config.width = chartsLocation?.clientWidth
    chartsLocation.prepend(new Chart(config))
}

async function weightAverageChartData() {
    let chartSettings = await getChartSettings()
    const weeklyData =
        await getWeeklyData(
            chartSettings,
            getWeightData)
    if (!weeklyData) return
    const { labels, maxValues, minValues, avgValues } = weeklyData

    // const borderWidth = labels.length < 500 ? 2 : 1
    // const pointRadius =
    //     labels.length < 500
    //         ? 2
    //     : labels.length > 750
    //         ? 1
    //     : 0
    const data: ChartData = {
        labels,
        datasets: [ {
                type: "line",
                label: "Max",
                values: maxValues,
                // pointRadius,
                // borderWidth,
                color: red,
            }, {
                type: "line",
                label: "Average",
                values: avgValues,
                // pointRadius,
                // borderWidth,
                color: green,
            }, {
                type: "line",
                label: "Min",
                values: minValues,
                // pointRadius,
                // borderWidth,
                color: blue,
            }
        ]
    }

    let config: ChartConfig = {
        title: `
        <span class="inline-box" style="--box-color: ${red};"></span>&nbsp;Max &nbsp;&nbsp;
        <span class="inline-box" style="--box-color: ${green};"></span>&nbsp;Average &nbsp;&nbsp;
        <span class="inline-box" style="--box-color: ${blue};"></span>&nbsp;Min`,
        data,
    }
    return config
}

async function weightData(): Promise<ChartConfig | undefined> {
    const startDate = (await api<UserSettings>("user-settings"))?.earliestDate
    if (!startDate) return
    const labels = dateFill(new Date(startDate), new Date())
    const rawValues = await getWeightData(startDate)
    if (!rawValues) return
    const values = rawValues.map(x => x?.weight || null)
    const data: ChartData = {
        labels: labels,
        datasets: [{
            color: red,
            type: labels.length < 500 ? 'line' : 'bar',
            values
        }]
    }
    const config: ChartConfig = {
        data,
        title: "Weight",
    }
    return config
}

async function histogram() {
    const startDate = (await api<UserSettings>("user-settings"))?.earliestDate
    if (!startDate) return
    const rawValues = await getWeightData(startDate)
    if (!rawValues) return
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
    const rawValues = await getWeightData(startDate)
    if (!rawValues) return
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
