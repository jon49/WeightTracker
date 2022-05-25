import { dateToString, formatNumber, toNumber } from "../js/utils.v2.js"
import html from "../js/html-template-tag.js"
import layout from "../_layout.html.js"
import * as db from "../js/db.js"
import { FormReturn,  WeightData } from "../js/db.js"
import { RoutePostArgs } from "../js/route.js"

const start = async (req: Request) => {
    const url = new URL(req.url)
    let date = url.searchParams.get("date") ?? dateToString(new Date())
    let data = await db.get<WeightData|undefined>(date)
    let weightData : FormReturn<WeightData> = {
        bedtime: data?.bedtime,
        comments: data?.comments,
        date,
        sleep: formatNumber(data?.sleep),
        waist: formatNumber(data?.waist),
        weight: formatNumber(data?.weight)
    }
    return weightData
}

async function post(data: WeightData) {
    if (!/\d{4}-[01]\d-[0123]\d/.test(data.date)) {
        return Promise.reject({ message: "Date is required!", error: new Error("post:/sw/entries/edit/")})
    }

    const cleanData : WeightData = {
        bedtime: data.bedtime,
        comments: data.comments,
        date: data.date,
        sleep: toNumber(data.sleep),
        waist: toNumber(data.waist),
        weight: toNumber(data.weight)
    }
    await db.set(cleanData.date, cleanData)
    let shouldSyncUserSettings = { sync: false }
    await db.update("user-settings", settings => {
        const earliestDate = settings?.earliestDate
        return !earliestDate
            ? (shouldSyncUserSettings.sync = true, { ...settings, earliestDate: data.date })
        : new Date(earliestDate) < new Date(data.date)
            ? settings
        : (shouldSyncUserSettings.sync = true, { ...settings, earliestDate: data.date })
    }, shouldSyncUserSettings)
    return
}

const render = ({ bedtime, comments, sleep, waist, weight, date }: FormReturn<WeightData>) => html`
<h2 id=subtitle>Add/Edit Entry</h2>
<form>
    <label>Date<br>
    <input id=date-change autofocus name=date type=date required value="${date}" onchange="this.form.submit()"></label>
    <br><br>
</form>
<form id=entry-form method=POST>
    <input name=date type=hidden value=${date}>

    <label>Weight<br>
    <input name=weight type=number step=any value="${weight}"></label><br><br>

    <label>Bedtime${bedtime?.endsWith("M") ? ` (${bedtime})` : "" }<br>
        <input style="min-width:214px" name=bedtime type=time value="${bedtime}">
    </label><br><br>

    <label>Number of hours slept<br>
        <input name=sleep type=number step=any value="${sleep}">
    </label><br><br>

    <label>Waist Size (cm)<br>
        <input id=entry-waist name=waist type=number step=any value="${waist}">
    </label><br><br>

    <label>Comment<br>
        <textarea id=entry-comments name=comments>${comments}</textarea>
    </label><br><br>

    <button>Save</button>
</form>`

async function get(req: Request) {
    let data = await start(req)
    let template = await layout(req)
    return template({ main: render(data) }) 
}

export default {
    route: /\/entries\/edit\/$/,
    get,
    async post({ data, req }: RoutePostArgs) {
        await post(data)
        return Response.redirect(req.referrer, 302)
    }
}
