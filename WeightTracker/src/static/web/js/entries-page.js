// @ts-check

import { getMany, get } from "./db.js"
import { subscribe } from "./actions.js"
import { dateFill, getById } from "./utils.js"
import h from "./h.js"

subscribe("start", async _ => {
    setRows(await getData(new Date().getFullYear()), true)

    const fragment = document.createDocumentFragment()
    /** @type {DB.UserSettings} */
    const userSettings = await get("user-settings")
    const date = new Date()
    const startYearString = +userSettings?.earliestDate?.slice(0, 4)
    const startYear = Number.isNaN(startYearString) ? date.getFullYear() : startYearString
    const endYear = date.getFullYear() - 1
    for (var i = endYear; i >= startYear; i--) {
        fragment.appendChild(h("button", { "data-year": i }, i))
    }
    fragment.appendChild(h("button", { "data-action": "reset" }, "Reset"))
    getById("years").appendChild(fragment)
})

subscribe("reset", async _ => {
    window.location.reload()
})

subscribe("show-year", async ({element}) => {
    const year = +element.dataset.year
    const anchor = h("a", { href: `#_${year}` }, year)
    setRows(await getData(year))
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
        fragment.appendChild(h("tr",
            h("td", idSet ? {} : {id: `_${d.date.slice(0, 4)}`}, d.date),
            h("td", d.weight),
            h("td", d.bedtime),
            h("td", d.sleep),
            h("td", d.waist),
            h("td", d.comments)
        ))
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
