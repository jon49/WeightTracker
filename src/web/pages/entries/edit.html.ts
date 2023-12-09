import { dateToString, formatNumber, round } from "../../js/utils.js"
import html from "html-template-tag-stream"
import layout from "../_layout.html.js"
import * as db from "../../server/db.js"
import { FormReturn, WeightData } from "../../server/db.js"
import { PostHandlers, Route } from "@jon49/sw/routes.js"
import { createDateString, createPositiveNumber, createString50, createTimeString, maybe, reject } from "@jon49/sw/validation.js"
import { validateObject } from "promise-validation"

const start = async (req: Request) => {
    const url = new URL(req.url)
    let date = url.searchParams.get("date") ?? dateToString(new Date())
    let data = await db.get<WeightData | undefined>(date)
    let weightData: FormReturn<WeightData> = {
        bedtime: data?.bedtime,
        comments: data?.comments,
        date,
        sleep: formatNumber(data?.sleep),
        waist: formatNumber(data?.waist),
        weight: formatNumber(data?.weight)
    }
    return weightData
}

const render = ({ bedtime, comments, sleep, waist, weight, date }: FormReturn<WeightData>) => html`
<h2>Add/Edit Entry</h2>
<form onchange="this.submit()">
    <label>Date<br>
    <input name=date type=date required value="${date}"></label>
    <br><br>
</form>
<form id=entry-form method=POST onchange="this.submit()">
    <input name=date type=hidden value=${date}>

    <label>Weight<br>
    <input name=weight type=number step=any value="${weight}"></label><br><br>

    ${(() => {
        if (!bedtime) {
            return html`<button formaction="?handler=startSleep">Bedtime</button>`
        }
        return html`<label>Bedtime${bedtime?.endsWith("M") ? ` (${bedtime})` : ""}<br>
            <input style="min-width:214px" name=bedtime type=time value="${bedtime}">
        </label>`
    })()}
    <br><br>

    ${(() => {
        if (!bedtime) {
            return null
        } else if (!sleep) {
            return html`<button formaction="?handler=wakeUp">Wake Up</button><br><br>`
        }
        return html`
            <label>Number of hours slept<br>
                <input id=wake-up-time name=sleep type=number step=any value="${sleep}">
            </label><br><br>`
    })()}

    <label>Waist Size (cm)<br>
        <input name=waist type=number step=any value="${waist}">
    </label><br><br>

    <label>Comment
        <elastic-textarea>
            <textarea name=comments>${comments}</textarea>
        </elastic-textarea>
    </label>
</form>

<script src="/web/js/elastic-textarea.js" defer></script>
`

const dateValidator = {
    date: createDateString("Date"),
}

const weightDataValidator = {
    ...dateValidator,
    weight: maybe(createPositiveNumber("Weight")),
    bedtime: maybe(createTimeString("Bedtime")),
    sleep: maybe(createPositiveNumber("Sleep")),
    waist: maybe(createPositiveNumber("Waist")),
    comments: maybe(createString50("Comments")),
    wakeUpTime: maybe(createTimeString("Wake Up Time")),
}

const postHandlers : PostHandlers = {
    async post({ data }) {
        let o = await validateObject(data, weightDataValidator)

        if (!o.bedtime) {
            o.sleep = undefined
        }

        await db.set(o.date, o)
        let shouldSyncUserSettings = { sync: false }
        await db.update("user-settings", settings => {
            const earliestDate = settings?.earliestDate
            return !earliestDate
                ? (shouldSyncUserSettings.sync = true, { ...settings, earliestDate: o.date })
                : new Date(earliestDate) < new Date(o.date)
                    ? settings
                    : (shouldSyncUserSettings.sync = true, { ...settings, earliestDate: o.date })
        }, shouldSyncUserSettings)
        return
    },

    async startSleep() {
        let now = new Date().toTimeString().slice(0, 5)
        let today = dateToString(new Date())
        let data = await db.get<WeightData | undefined>(today)
        if (!data) {
            data = { date: today }
        }
        data.bedtime = now
        await db.set(data.date, data)
    },

    async wakeUp({ data }) {
        let { date } = await validateObject(data, dateValidator)
        let o = await db.get<WeightData | undefined>(date)
        if (!o) {
            return reject("No data found for this date")
        }
        let wakeUpTime = new Date().toTimeString().slice(0, 5)
        if (o.bedtime) {
            let bedtime = new Date(`1970-01-01T${o.bedtime}`)
            let wakeUpDateTime = new Date(`1970-01-0${+(+o.bedtime.slice(0, 2) > +wakeUpTime.slice(0, 2)) + 1}T${wakeUpTime}`)
            // time slept (milliseconds) / 1000 (milliseconds) / 60 (seconds) / 60 (hours)
            o.sleep = round((+wakeUpDateTime - +bedtime) / 36e5, 2)
        }
        await db.set(o.date, o)
    }
}

const routes : Route = {
    route: /\/entries\/edit\/$/,

    async get({ req }) {
        let data = await start(req)
        let template = await layout(req)
        return template({ main: render(data) })
    },

    post: postHandlers
}

export default routes

