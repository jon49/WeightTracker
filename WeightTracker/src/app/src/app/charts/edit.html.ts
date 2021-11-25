import { DB, Module, ModuleStart } from "globals"
import { formatNumber, getFormData, isSelected, toNumber } from "../js/utils.js"

const { html, db: { get, set } } = app
const units = ["month", "year", "week"] as const
export type DurationUnit = typeof units[number]

let o : { duration?: string | undefined, durationUnit?: DurationUnit }

// @ts-ignore
const start : ModuleStart = async (req): Promise<Generator<unknown, any, unknown> | undefined> => {
    if (req.headers.get("method") === "POST") {
        return post(await req.formData())
    }
    let chartSettings = await get("chart-settings")
    o = {}
    o.duration = formatNumber(chartSettings?.duration)
    o.durationUnit = chartSettings?.durationUnit
}

const $form = () => {
    const selected = isSelected<DurationUnit>(o.durationUnit)
    return html`
<form id=chart-settings>
    <input name=duration type=number placeholder="Number of months" required value="${o.duration}">
    <select name=durationUnit required>
        <option value=month ${selected("month")}>Month(s)</option>
        <option value=week ${selected("week")}>Week(s)</option>
        <option value=year ${selected("year")}>Year(s)</option>
    </select><br><br>
    <button>OK</button>
</form>`
}

const render = () => html`<h2>Chart Settings</h2>${$form()}`

async function post(formData: FormData): Promise<Generator> {
    const form = getFormData<DB.ChartSettings>(formData)
    const duration = toNumber(form.duration) || 9
    const maybeDurationUnit = form.durationUnit
    const durationUnit = units.find(x => x === maybeDurationUnit) ?? "month"
    const settings : DB.ChartSettings = { duration, durationUnit }
    await set("chart-settings", settings)
    o.duration = formatNumber(duration)
    o.durationUnit = durationUnit
    return $form()
}

export default {
    render, start
} as Module
