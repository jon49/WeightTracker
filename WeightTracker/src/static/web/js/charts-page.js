/// <reference types="../node_modules/@types/global" />
// @ts-check

import { get, getMany } from "./db.js"
import { avg, dateAdd, dateFill, formatNumber, getById, getPreviousDay, reduceSlice, stdev } from "./utils.js"
import { subscribe } from "./actions.js"
import "./lib/chart.min.js"
import h from "./h.js"

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
subscribe("create-chart", async ({ element }) => {
    /** @type {HTMLButtonElement} */
    // @ts-ignore
    const e = element
    e.classList.add("hidden")

    const baseId = e.id.slice(0, -4)
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
    const startDate = (/** @type {?DB.UserSettings} */(await get("user-settings")))?.earliestDate
    if (!startDate) return
    const labels = dateFill(new Date(startDate), new Date())
    const rawValues = /** @type {[DB.WeightData?]} */(await getMany(labels))
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
    const startDate = (/** @type {?DB.UserSettings} */(await get("user-settings")))?.earliestDate
    if (!startDate) return
    const rawValues = /** @type {[DB.WeightData?]} */(await getMany(dateFill(new Date(startDate), new Date())))
    const values = {}
    for (let val of rawValues) {
        let weight
        if (weight = val?.weight | 0) {
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
    const startDate = getPreviousDay(dateAdd(new Date(), -274 - 7 /* 9 months */), 0 /* sunday */)
    const dates = dateFill(startDate, new Date())
    const rawValues = /** @type {[DB.WeightData?]} */(await getMany(dates))
    const averages = reduceSlice(dates, 7, (acc, val, index) => {
        if (acc.date) return acc
        acc.date = val
        const v = rawValues.slice(index, index + 7).filter(x => x?.weight).map(x => x.weight)
        acc.avg = avg(v) || null
        return acc
    }, () => /** @type {{ date: string, avg: number | null }} */({}))
    const length = averages.length
    /** @type {{ x?: string, pos?: number|null, neg?: number|null, avgAll?: number, avgNeg?: number }[]} */
    const values = new Array(length - 1)
    /** @type {number|null} */
    let allTotal = null
    /** @type {number|null} */
    let negTotal = null
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
    const startDate = getPreviousDay(dateAdd(new Date(), -274 /* 9 months */), 0 /* sunday */)
    const dates = dateFill(startDate, new Date())
    const rawValues = /** @type {[DB.WeightData?]} */(await getMany(dates))
    const values = reduceSlice(dates, 7, (acc, val, index) => {
        if (acc.date) return acc
        acc.date = val
        const v = rawValues.slice(index, index + 7).filter(x => x?.sleep).map(x => x.sleep)
        acc.avg = avg(v) || null
        acc.std = stdev(v) || null
        return acc
    }, () => /** @type {{ date?: string, avg?: number, std?: number }} */({}))

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

async function setupStats() {
    /** @type {DB.UserSettings} */
    const userSettings = await get("user-settings")
    const now = new Date(),
        startDate = getPreviousDay(new Date(), 0),
        dates = dateFill(startDate, now),
        /** @type {DB.WeightData[]} */
        previousData = await getMany(dateFill(dateAdd(startDate, -7), dateAdd(startDate, -1))),
        /** @type {DB.WeightData[]} */
        data = (await getMany(dates)).filter(x => x),
        weights = data.filter(x => x?.weight).map(x => x.weight),
        averageWeight = avg(weights),
        previousWeightAvg = avg(previousData.filter(x => x?.weight).map(x => x.weight)),
        std = stdev(weights)

    let bmiPrime
    let goalWeight = getGoalWeight(userSettings, averageWeight)
    if (userSettings?.height) {
        let heightSquared = Math.pow(userSettings.height, 2)
        bmiPrime = formatNumber(averageWeight / heightSquared * 703 / 25, 3)
    }
    let $stats = getById("stats")
    $stats.innerHTML = ""
    $stats.appendChild(
        h("tr",
            // BMI
            h("td", bmiPrime || ""),
            // Weeks to go
            h("td", await weeksToGo()),
            // Deviation during week
            h("td", formatNumber(std, 2)),
            // Goal
            h("td",  goalWeight),
            // Average weight
            h("td", formatNumber(averageWeight, 2)),
            // Weight change rate
            h("td", formatNumber(averageWeight - previousWeightAvg, 2))
        ))
}

async function weeksToGo() {
    /** @type {WeeklyData} */
    const { avgValues } = await getWeeklyData(),
        length = avgValues.length,
        /** @type {DB.UserSettings} */
        userSettings = await get("user-settings"),
        currentWeight = avgValues[length - 1],
        goalWeight = getGoalWeight(userSettings, currentWeight)
    if (!goalWeight) return
    let all = new Array(length - 1), neg = new Array(length - 1)
    for (let index = 1; index < length; index++) {
        let difference = avgValues[index] - avgValues[index - 1]
        if (Number.isNaN(difference)) continue
        all[index - 1] = difference
        if (difference < 0) {
            neg[index - 1] = difference
        }
    }
    let avgAll = -avg(all)
    let avgNeg = -avg(neg)
    let diff = currentWeight - +goalWeight
    return `${formatNumber(diff/avgNeg, 1)} to ${formatNumber(diff/avgAll, 1)}`
}

/**
 * @returns {Promise<WeeklyData>}
 */
async function getWeeklyData() {
    const startDate = getPreviousDay(dateAdd(new Date(), -274 /* 9 months */), 0 /* sunday */)
    const dates = dateFill(startDate, new Date())
    const rawValues = /** @type {[DB.WeightData?]} */(await getMany(dates))
    const results = reduceSlice(dates, 7, (acc, x, i) => {
        let weight
        acc.date = acc.date ?? x
        if ((weight = rawValues[i]?.weight) && !!weight) {
            acc.min = 
                acc.min === null
                    ? weight
                : Math.min(acc.min, weight)
            acc.max =
                acc.max === null
                    ? weight
                : Math.max(acc.max, weight)
            acc.total += weight
            acc.count++
            return acc
        }
        return acc
    }, () => /** @type {{min: null|number, max: null|number, total: number, count: number, date: string}} */({min: null, max: null, total: 0, count: 0, date: null}))

    const labels = new Array(results.length)
    const maxValues = new Array(results.length)
    const minValues = new Array(results.length)
    const avgValues = new Array(results.length)
    for (let index = 0; index < results.length; index++) {
        const r = results[index];
        labels[index] = r.date
        maxValues[index] = r.max
        minValues[index] = r.min
        avgValues[index] = r.count ? r.total/r.count : null
    }

    /** @type {WeeklyData} */
    return {labels, maxValues, minValues, avgValues}
}

/**
 * @typedef {Object} WeeklyData
 * @property {string[]} labels
 * @property {number[]} maxValues
 * @property {number[]} avgValues
 * @property {number[]} minValues
 */

/**
 * @param {DB.UserSettings} userSettings 
 * @param {number} currentWeight
 * @returns {string}
 */
function getGoalWeight(userSettings, currentWeight) {
    let goalWeight
    if (userSettings?.height) {
        let heightSquared = Math.pow(userSettings.height, 2)
        goalWeight = 25 * heightSquared / 703
    }
    goalWeight = formatNumber(userSettings?.goalWeight ?? goalWeight, 2)
    return goalWeight
}

subscribe("start", setupStats)
