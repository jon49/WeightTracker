import { dateToString, round } from "../../js/utils.js"
import html from "html-template-tag-stream"
import layout from "../_layout.html.js"
import * as db from "../../server/db.js"
import { WeightData } from "../../server/db.js"
import { Route, RouteGetHandler, RoutePostHandler } from "@jon49/sw/routes.js"
import { createDateString, createPositiveNumber, createString50, createTimeString, maybe, reject } from "@jon49/sw/validation.js"
import { validateObject } from "promise-validation"

async function render(query: any) {
    let { date } = await validateObject(query, { date: maybe(createDateString("Query Date")) })
    if (!date) {
        date = dateToString(new Date())
    }
    // {}: FormReturn<WeightData>
    let data = (await db.get<WeightData | undefined>(date))
        ?? {
            date,
            weight: void 0,
            waist: void 0,
            bedtime: void 0,
            sleep: void 0,
            comments: void 0
        }

    return html`
<h2>Add/Edit Entry</h2>
<form
    action="/web/entries/edit?handler=date"
    hf-target="#entry-form"
    onchange="this.requestSubmit()">
    <label>Date<br>
    <input name=date type=date required value="${date}"></label>
    <br><br>
</form>

<form id=entry-form method=post action="/web/entries/edit" onchange="this.requestSubmit()">
    ${getEntryForm(data)}
</form>
<script src="/web/js/elastic-textarea.js" defer></script>
`
}

function getEntryForm({ date, bedtime, sleep, weight, waist, comments } : WeightData) {
    return html`
<input name=date type=hidden value=${date}>

<div class=row>
<label>Weight<br>
<input name=weight type=number step=any value="${weight}"></label>
</div>
<button class=hidden></button>

<div class=row>
${getBedtime(bedtime)}
${getWakeUp(bedtime, sleep)}
</div>

<div class=row>
<label>Waist Size (cm)<br>
    <input name=waist type=number step=any value="${waist}">
</label>
</div>

<div class=row>
<label>Comment
    <elastic-textarea>
        <textarea name=comments>${comments}</textarea>
    </elastic-textarea>
</label>
</div>`
}

function getWakeUp(bedtime: string | undefined, sleep: number | undefined) {
    return !bedtime
        ? null
    : !sleep
        ? html`<button id=wake-up hf-target="#wake-up" hf-swap=outerHTML formaction="/web/entries/edit?handler=wakeUp">Wake Up</button><br><br>`
    : html`
        <label>Hours Slept<br>
            <input id=wake-up-time name=sleep type=number step=any value="${sleep}">
        </label>`
}

function getBedtime(bedtime: string | undefined) {
    if (!bedtime) {
        return html`<button formaction="/web/entries/edit?handler=startSleep">
        Bedtime
        </button>`
    }
    return html`
    <label>Bedtime${bedtime?.endsWith("M") ? ` (${bedtime})` : ""}<br>
        <input style="min-width:214px" name=bedtime type=time value="${bedtime}">
    </label>`
}

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

const postHandlers : RoutePostHandler = {
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

        return getEntryForm(o)
    },

    async startSleep({ data }) {
        let { date } = await validateObject(data, dateValidator)
        let now = new Date().toTimeString().slice(0, 5)
        date ??= dateToString(new Date())
        let dbData = await db.get<WeightData | undefined>(date)
        if (!dbData) {
            dbData = { date }
        }
        dbData.bedtime = now
        await db.set(dbData.date, dbData)

        return getEntryForm(dbData)
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
        return getWakeUp(o.bedtime, o.sleep)
    }
}

const getHandlers: RouteGetHandler = {
    async date({ query }) {
        let { date } = await validateObject(query, dateValidator)
        let data = (await db.get<WeightData | undefined>(date)) ?? { date }
        return getEntryForm(data)
    },

    async get({ query }) {
        return layout({
            main: await render(query),
            title: "Edit Entry"
        })
    },
}

const routes : Route = {
    route: /\/entries\/edit\/$/,
    get: getHandlers,
    post: postHandlers
}

export default routes

