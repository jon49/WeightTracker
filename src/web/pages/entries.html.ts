import { dateFill, dateToString } from "../js/utils.js"
import html from "html-template-tag-stream"
import layout from "./_layout.html.js"
import { get, getMany, WeightData } from "../server/db.js"
import { Route } from "@jon49/sw/routes.js"
import { createPositiveNumber, maybe } from "@jon49/sw/validation.js"
import { validateObject } from "promise-validation"

interface WeightDataYear extends WeightData { year: string }

function $row({date, weight, bedtime, sleep, waist, comments}: WeightDataYear) {
    let c : string[] = comments?.split('\n') ?? []
    let comment =
        c.length > 1
            ? c.map(x => html`${x}<br>`)
        : c.length === 1
            ? c[0]
        : null

    return html`<tr>
        <td><a href="/web/entries/edit?date=$${date}">$${date}</a></td>
        <td>${weight}</td>
        <td>${cleanBedtime(bedtime)}</td>
        <td>${sleep}</td>
        <td>${waist}</td>
        <td>${comment}</td>
    </tr>`
}

const entriesValidator = {
    year: maybe(createPositiveNumber("Query Year"))
}

async function render(query: any) {
    let { year } = await validateObject(query, entriesValidator)
    year ??= new Date().getFullYear()
    let data : WeightDataYear[] = []
    const [ yearList, dataList ] = await Promise.all([getYears(), getData(year)])
    const years = yearList.map(x => ""+x)
    for (let index = 0; index < dataList.data.length; index++) {
        let d = <WeightDataYear>dataList.data[index];
        if (!d) continue
        d.year = dataList.dates[index]
        data.push(d)
    }

    return html`
<h2 id="top">Entries</h2>

<div class=date-list>
    ${years.reverse().map((year: string) => html`<a href="/web/entries?year=${year}">${year}</a>`)}
</div>

<table>
    <thead><tr><th>Date&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</th><th>Weight</th><th>Bedtime</th><th>Hours Slept</th><th>Waist (cm)</th><th>Comments</th></tr></thead>
    <tbody>${data.reverse().map($row)}</tbody>
</table>

<a href="#" class="back-to-top button">Back to Top</a>`

}

async function getData(year: number) : Promise<TableData> {
    const start = new Date()
    start.setDate(1)
    start.setMonth(0)
    start.setFullYear(year)
    const end = new Date(start)
    end.setMonth(11)
    end.setDate(31)
    const dates = dateFill(start, end)
    const data : WeightData[] = await getMany(dates)
    return {dates, data}
}

async function getYears() : Promise<number[]> {
    const thisYear = new Date().getFullYear()
    const settings = await get("user-settings")
    const startYearString = +(settings?.earliestDate?.slice(0, 4) ?? dateToString(new Date()))
    const startYear = Number.isNaN(startYearString) ? thisYear : startYearString
    return [...Array(thisYear - startYear + 1).keys()].map(x => x + startYear)
}

function cleanBedtime(bedtime: string | undefined) {
    if (!bedtime || bedtime.length !== 5 || bedtime[bedtime.length - 1] === "M") return bedtime

    let time = new Date(`1970-01-01T${bedtime}`).toLocaleTimeString()
    return html`${time.slice(0, time.lastIndexOf(":"))}&nbsp;${time.slice(-2)}`
}

const head = `
    <style>
        .date-list > a {
            display: inline-block;
            padding-right: 10px;
            padding-top: 3px;
        }
        tr > td:nth-child(3) {
            text-align: right;
        }
    </style>`

interface TableData {
    dates: string[]
    data: WeightData[]
}

const route: Route = {
    route: /\/entries\/$/,
    async get({ query }) {
        return layout({
            main: await render(query),
            head,
            bodyAttr: `data-mpa-scroll-to="#top"`,
            title: "Entries",
        })
    }
}

export default route
