import { formatNumber, isSelected, toNumber } from "../../js/utils.js"
import html from "html-template-tag-stream"
import layout from "../_layout.html.js"
import * as db from "../../server/db.js"
import { Route } from "@jon49/sw/routes.js"
import { validateObject } from "promise-validation"
import { createPositiveNumber, createPositiveWholeNumber, createString25 } from "@jon49/sw/validation.js"

const units = ["month", "year", "week"] as const
export type DurationUnit = typeof units[number]

async function render() {
    let chartSettings = await db.get("chart-settings")
    let data = {
        duration: formatNumber(chartSettings?.duration, 0),
        durationUnit: chartSettings?.durationUnit
    }
    const selected = isSelected<DurationUnit>(data.durationUnit)
    return html`<h2>Chart Settings</h2>
<form method=POST onchange="this.requestSubmit()">
    <input type=hidden name=_rev value="${chartSettings?._rev ?? 0}">
    <input name=duration type=number placeholder="Number of months" required value="${data.duration}">
    <select name=durationUnit required>
        <option value=month ${selected("month")}>Month(s)</option>
        <option value=week ${selected("week")}>Week(s)</option>
        <option value=year ${selected("year")}>Year(s)</option>
    </select><br><br>
</form>`
}

let settingsValidator = {
    duration: createPositiveNumber("Duration"),
    durationUnit: createString25("Duration Unit"),
    _rev: createPositiveWholeNumber("_rev")
}

const route: Route = {
    route: /\/charts\/edit\/$/,
    async get() {
        return layout({
            main: await render(),
            title: "Chart Settings",
        })
    },

    async post({ data }) {
        const o =
            await validateObject(data, settingsValidator)
        const duration = toNumber(o.duration) || 9
        const maybeDurationUnit = o.durationUnit
        const durationUnit = units.find(x => x === maybeDurationUnit) ?? "month"
        const settings: db.ChartSettings = { duration, durationUnit, _rev: o._rev }
        await db.set("chart-settings", settings)
        return { status: 204 }
    }
}

export default route
