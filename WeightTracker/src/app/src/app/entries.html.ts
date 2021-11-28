import { DB, Module } from "globals"
import { dateFill, dateToString } from "./js/utils.js"

const { html, db: { getMany, get } } = app

interface WeightDataYear extends DB.WeightData { year: string }
let data : WeightDataYear[]
let years: string[]

const start = async (req: Request) => {
    data = []
    years = []
    const url = new URL(req.url)
    const year = +(url.searchParams.get("year") ?? new Date().getFullYear())
    const [ yearList, dataList ] = await Promise.all([getYears(), getData(year)])
    years = yearList.map(x => ""+x)
    for (let index = 0; index < dataList.data.length; index++) {
        let d = <WeightDataYear>dataList.data[index];
        if (!d) continue
        d.year = dataList.dates[index]
        data.push(d)
    }
}

const $row = ({date, weight, bedtime, sleep, waist, comments}: WeightDataYear) => html`
    <tr>
        <td>${date}</td>
        <td>${weight}</td>
        <td>${bedtime}</td>
        <td>${sleep}</td>
        <td>${waist}</td>
        <td>${comments}</td>
    </tr>`

const $link = (year: string) => html`<a href="?year=${year}">${year}</a>&nbsp;&nbsp;`

const render = () => 
    html`
<h2 id=top>Entries</h2>

<div>
    ${years.map($link)}
</div>

<table>
    <thead><tr><th>Date&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</th><th>Weight</th><th>Bedtime</th><th>Hours Slept</th><th>Waist (cm)</th><th>Comments</th></tr></thead>
    <tbody>${data.map($row)}</tbody>
</table>

<a href="#top" class="back-to-top button">Back to Top</a>`

async function getData(year: number) : Promise<TableData> {
    const start = new Date()
    start.setDate(1)
    start.setMonth(0)
    start.setFullYear(year)
    const end = new Date(start)
    end.setMonth(11)
    end.setDate(31)
    const dates = dateFill(start, end)
    const data : DB.WeightData[] = await getMany(dates)
    return {dates, data}
}

async function getYears() : Promise<number[]> {
    const thisYear = new Date().getFullYear()
    const settings = await get("user-settings")
    const startYearString = +(settings?.earliestDate?.slice(0, 4) ?? dateToString(new Date()))
    const startYear = Number.isNaN(startYearString) ? thisYear : startYearString
    return [...Array(thisYear - startYear + 1).keys()].map(x => x + startYear)
}

interface TableData {
    dates: string[]
    data: DB.WeightData[]
}

export default {
    start, render
} as Module
