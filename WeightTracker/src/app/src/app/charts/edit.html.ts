import { DB, Module } from "globals"
import { formatNumber, isSelected, toNumber } from "../js/utils.js"

const { html, db: { get, set }, addRoute } = app
const units = ["month", "year", "week"] as const
export type DurationUnit = typeof units[number]

interface ChartData {
    duration?: string | undefined
    durationUnit?: DurationUnit
}

const getData = async (): Promise<ChartData> => {
    let chartSettings = await get("chart-settings")
    return {
        duration: formatNumber(chartSettings?.duration),
        durationUnit: chartSettings?.durationUnit
    }
}

const $form = (data: ChartData) => {
    const selected = isSelected<DurationUnit>(data.durationUnit)
    return html`
<form id=chart-settings>
    <input name=duration type=number placeholder="Number of months" required value="${data.duration}">
    <select name=durationUnit required>
        <option value=month ${selected("month")}>Month(s)</option>
        <option value=week ${selected("week")}>Week(s)</option>
        <option value=year ${selected("year")}>Year(s)</option>
    </select><br><br>
    <button>OK</button>
</form>`
}

const render = (data: ChartData) => html`<h2>Chart Settings</h2>${$form(data)}`

async function post(data: DB.ChartSettings) {
    const duration = toNumber(data.duration) || 9
    const maybeDurationUnit = data.durationUnit
    const durationUnit = units.find(x => x === maybeDurationUnit) ?? "month"
    const settings : DB.ChartSettings = { duration, durationUnit }
    await set("chart-settings", settings)
}

export default {
    get: async () => {
        let data = await getData()
        return render(data)
    },
    post: async (_, data, __) => {
        await post(data)
        return {
            partial: async () => {
                var data = await getData()
                return $form(data)
            },
            redirect: "/app/charts/edit/"
        }
    }
} as Module

addRoute({
    route: /\/charts\/edit$/,
    method: "GET",
    func: () => {}
})
