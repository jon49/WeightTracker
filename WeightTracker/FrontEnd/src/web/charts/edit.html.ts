import { formatNumber, isSelected, toNumber } from "../js/utils.v2"
import html from "../server/html-template-tag"
import layout from "../_layout.html"
import * as db from "../server/db"
import { RoutePostArgs } from "../server/route"

const units = ["month", "year", "week"] as const
export type DurationUnit = typeof units[number]

interface Data {
    duration: string | undefined
    durationUnit: any
}

async function getData() : Promise<Data> {
    let chartSettings = await db.get("chart-settings")
    return {
        duration: formatNumber(chartSettings?.duration, 0),
        durationUnit: chartSettings?.durationUnit
    }
}

const render = (data: Data) => {
    const selected = isSelected<DurationUnit>(data.durationUnit)
    return html`<h2>Chart Settings</h2>
<form method=POST onchange="this.submit()">
    <input name=duration type=number placeholder="Number of months" required value="${data.duration}">
    <select name=durationUnit required>
        <option value=month ${selected("month")}>Month(s)</option>
        <option value=week ${selected("week")}>Week(s)</option>
        <option value=year ${selected("year")}>Year(s)</option>
    </select><br><br>
</form>`
}

function post(data: db.ChartSettings) {
    const duration = toNumber(data.duration) || 9
    const maybeDurationUnit = data.durationUnit
    const durationUnit = units.find(x => x === maybeDurationUnit) ?? "month"
    const settings : db.ChartSettings = { duration, durationUnit }
    return db.set("chart-settings", settings)
}

let getHandler = async (req: Request) => {
    let [data, template] = await Promise.all([getData(), layout(req)])
    return template({ main: render(data) })
}

export default {
    route: /\/charts\/edit\/$/,
    get: getHandler,
    async post({data, req}: RoutePostArgs) {
        await post(data)
        return Response.redirect(req.referrer, 302)
    }
}

