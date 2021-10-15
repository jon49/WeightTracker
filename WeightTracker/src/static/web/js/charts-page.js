/// <reference types="../node_modules/@types/global" />
// @ts-check

import { get, getMany } from "./db.js"
import { dateAdd, dateFill, getById } from "./utils.js"
import { action } from "./actions.js"
import "./lib/chart.min.js"
import h from "./h.js"

const red = "#ff6384", blue = "#6391ff", green = "#63ff83"
const chartsLocation = getById("charts-location")

const chartFunc = {
    "chart-weight": weightData,
    "chart-weight-average": weightAverageChartData
}

const charts = new Map()
action.set("create-chart", async ({ element }) => {
    /** @type {HTMLButtonElement} */
    const e = element
    e.classList.add("hidden")

    const baseId = e.id.slice(0, -4)
    // @ts-ignore
    chartsLocation.prepend(getById(`${baseId}-template`).content.cloneNode(true))

    // @ts-ignore
    charts.set(baseId, new Chart(baseId, await chartFunc[baseId]()))
})

async function weightAverageChartData() {
    const startDate = dateAdd(new Date(), -274 /* 9 months */)
    while (startDate.getDay() > 0) {
        dateAdd(startDate, -1)
    }
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

    const borderWidth = labels.length < 500 ? 2 : 1
    const pointRadius = labels.length < 500 ? 2 : 0
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
            pointRadius: values.length < 500 ? 1 : 0,
            borderWidth: 1
        }]
    }
    const config = {
        type: 'line',
        data,
        options: {}
    }
    return config
}

/**
 * @template T
 * @param {string | any[]} data
 * @param {number} step
 * @param {(acc: T, val: any, index: number) => T} f
 * @param {() => T} init
 * @returns {T[]}
 */
function reduceSlice(data, step, f, init) {
  const length = data.length
  const arr = new Array(Math.ceil(length/step))
  for (let index = 0; index < length; index += step) {
    let acc = init instanceof Function ? init() : init
    for (let i = index; i < step + index && i < length; i++) {
      acc = f(acc, data[i], i)
    }
    arr[(index/step)] = acc
  }
  return arr
}

;(async function() {
//<tr> <td id=bmi></td><td id=weeks></td><td id=deviation></td><td id=goal></td><td id=weight></td><td id=rate></td> </tr>
    /** @type {DB.UserSettings} */
    const userSettings = await get("user-settings")
    const now = new Date(),
        startDate = getSunday(new Date()),
        dates = dateFill(startDate, now),
        /** @type {DB.WeightData[]} */
        data = (await getMany(dates)).filter(x => x),
        weights = data.filter(x => x.weight).map(x => x.weight),
        averageWeight =
            weights.length > 0 ?
                weights
                .reduce((acc, val) => acc + val, 0)/weights.length
            : 0

    let bmiPrime
    if (userSettings?.height) {
        bmiPrime = formatNumber(Math.round(averageWeight / Math.pow(userSettings.height, 2) * 703 / 25), 3)
    }
    getById("stats").append(
        h("tbody",
            h("tr",
                // BMI
                h("td", bmiPrime || ""),
                // Weeks to go
                h("td", 0),
                // Deviation during week
                h("td", ""),
                // Goal
                h("td", ""),
                // Average weight
                h("td", formatNumber(averageWeight, 2)),
                // Weight change rate
                h("td", "")
            )
        ).el)
})()

/**
 * @param {number} number
 * @param {number} precision
 * @returns {string}
 */
function formatNumber(number, precision) {
    let multiplier = Math.pow(10, precision)
    return (Math.round(number * multiplier) / multiplier).toFixed(precision)
}

/**
 * @param {Date} startDate
 */
function getSunday(startDate) {
    while (startDate.getDay() > 0) {
        dateAdd(startDate, -1)
    }
    return startDate
}
