// @ts-check

import { getMany, get } from "./db.js"
import { subscribe } from "./actions.js"
import { dateFill, getById, toHTML } from "./utils.js"
import html from "./hash-template.js"

// @ts-ignore
const row = html(getById("row-template"))

subscribe("start", async _ => {
    const data = await getData(new Date().getFullYear())

    const fragment = document.createDocumentFragment()
    /** @type {DB.UserSettings} */
    const userSettings = await get("user-settings")
    const date = new Date()
    const startYearString = +userSettings?.earliestDate?.slice(0, 4)
    const startYear = Number.isNaN(startYearString) ? date.getFullYear() : startYearString
    const endYear = date.getFullYear() - 1
    const button = html`<button #data-year,text=year></button>`
    for (var i = endYear; i >= startYear; i--) {
        fragment.appendChild(button().update({year: i}).root)
    }
    fragment.appendChild(toHTML("<button data-action=reset>Reset</button>"))
    getById("years").appendChild(fragment)

    setRows(data, true)
})

subscribe("reset", async _ => {
    window.location.reload()
})

const $anchor = html(toHTML("<a #href=href class=button>#year</a>"))
subscribe("show-year", async ({element}) => {
    const year = +element.dataset.year
    const data = await getData(year)
    const anchor = $anchor().update({ href: `#_${year}`, year }).root
    setRows(data)
    element.replaceWith(anchor)
    let id = setTimeout(_ => {
        location.hash = `_${year}`
        clearTimeout(id)
    }, 1)
})

/**
 * @param {TableData} data 
 * @param {boolean} [clearData]
 */
function setRows({data, dates}, clearData) {
    const fragment = document.createDocumentFragment()
    let idSet = false
    for (let index = dates.length - 1; index >= 0; index--) {
        let d = data[index]
        if (!d) continue
        let newRow = row()
        if (!idSet) {
            // @ts-ignore
            d.dateId = `_${d.date.slice(0, 4)}`
            idSet = true
        }
        let temp = newRow.update(d)
        fragment.appendChild(temp.root)
    }
    const $tbody = document.querySelector("tbody")
    if (clearData) {
        $tbody.innerHTML = ""
    }
    $tbody.appendChild(fragment)
}

/**
 * @param {number} year 
 * @returns {Promise<TableData>}
 */
async function getData(year) {
    const start = new Date()
    start.setDate(1)
    start.setMonth(0)
    start.setFullYear(year)
    const end = new Date(start)
    end.setMonth(11)
    end.setDate(31)
    const dates = dateFill(start, end)
    /** @type {DB.WeightData[]} */
    // @ts-ignore
    const data = await getMany(dates)
    return {dates, data}
}

/**
 * @typedef TableData
 * @property {string[]} dates
 * @property {DB.WeightData[]} data
 */
