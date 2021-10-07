/// <reference types="../@types/global" />
// @ts-check

import { get, getMany } from "./db.js"
import { dateAdd, dateFill, getById } from "./utils.js"
import { action } from "./actions.js"

const red = "#ff6384", blue = "#6391ff", green = "#63ff83"

let weightChart, weightAverageChart
action.set("create-chart", async ({ element }) => {
    // This needs to be refactored. It's really messy!
    // @ts-ignore
    let { } = await import("https://cdn.jsdelivr.net/npm/chart.js@3.5.1/dist/chart.min.js")
    const id = element.id,
          canvas = document.createElement("div")
    canvas.innerHTML = `<canvas id=${id}></canvas>`
    let data =
        id === "chart-weight"
            ? await weightData()
        : id === "chart-weight-average"
            ? await weightAverageChartData()
        : null
    element.remove()
    getById("charts-location").prepend(canvas)
    switch (id) {
        case "chart-weight":
            // @ts-ignore
            weightChart = new Chart(id, data)
            break;
        case "chart-weight-average":
            // @ts-ignore
            weightAverageChart = new Chart(id, data)
            break;
        default:
            break;
    }
})

async function weightAverageChartData() {
    const startDate = dateAdd(new Date(), -274 /* 9 months */)
    while (startDate.getDay() > 0) {
        dateAdd(startDate, -1)
    }
    const dates = dateFill(startDate, new Date())
    /** @type {[WeightData?]} */
    const rawValues = await getMany(dates)
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
    const startDate = (/** @type {?Settings} */(await get("settings")))?.earliestDate
    if (!startDate) return
    const labels = dateFill(new Date(startDate), new Date())
    /** @type {[WeightData?]} */
    const rawValues = await getMany(labels)
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
