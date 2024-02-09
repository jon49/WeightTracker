import { WeightData } from "../../server/db.js"
import { RouteGetHandler, RoutePage, RoutePostHandler } from "@jon49/sw/routes.js"

let {
    db,
    html,
    layout,
    utils: { cleanWeightData, dateToString, round },
    validation: { createDateString, createPositiveNumber, createPositiveWholeNumber, createStringInfinity, createTimeString, maybe, reject, validateObject },
} = self.app

async function render(query: any) {
    let { date } = await validateObject(query, { date: maybe(createDateString("Query Date")) })
    if (!date) {
        let d = new Date()
        // If it's after 8 PM then set to the next day
        if (d.getHours() >= 20) {
            d.setDate(d.getDate() + 1)
        }
        date = dateToString(d)
    }
    let data = <WeightData>(await db.get<WeightData | undefined>(date)) ?? { date }
    cleanWeightData(data)

    let url = `/web/entries/edit?date=`

    return html`
<h2>Add/Edit Entry</h2>
<form
    action="/web/entries/edit?handler=date"
    hf-target="#entry-form"
    onchange="app.updateUrl('${url}' + this.date.value); this.requestSubmit()">
    <label>Date<br>
    <input name=date type=date required value="${date}"></label>
    <br>
</form>

<form id=entry-form method=post action="/web/entries/edit" onchange="this.requestSubmit()">
    ${getEntryForm(data)}
</form>
<script src="/web/js/elastic-textarea.js" defer></script>
`
}

function getEntryForm(o: WeightData) {
    cleanWeightData(o)
    let { date, bedtime, sleep, weight, waist, comments, _rev } = o
    return html`
<input name=date type=hidden value=${date}>
<input name=_rev type=hidden value=${_rev}>

<label>Weight<br>
<input name=weight type=number step=any value="${weight}"></label>
<button class=hidden></button>

<br>
${getBedtime(bedtime)}
<br>
${getWakeUp(bedtime, sleep)}

<br>

<label>Waist Size (cm)<br>
    <input name=waist type=number step=any value="${waist}">
</label>

<br>

<label>Comment
    <elastic-textarea>
        <textarea name=comments>${comments}</textarea>
    </elastic-textarea>
</label>
`
}

function getWakeUp(bedtime: string | undefined, sleep: number | undefined) {
    return !bedtime
        ? null
    : !sleep
        ? html`<button id=wake-up hf-target="#wake-up" hf-swap=outerHTML formaction="/web/entries/edit?handler=wakeUp">Wake Up</button>`
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
    comments: maybe(createStringInfinity("Comments")),
    wakeUpTime: maybe(createTimeString("Wake Up Time")),
    _rev: createPositiveWholeNumber("Revision"),
}

const postHandlers : RoutePostHandler = {
    async post({ data }) {
        let o = await validateObject(data, weightDataValidator)

        cleanWeightData(o)

        await db.set(o.date, o)
        let shouldSyncUserSettings = { sync: false }
        await db.update("user-settings", settings => {
            const earliestDate = settings?.earliestDate
            return !earliestDate
                ? (shouldSyncUserSettings.sync = true, {
                    ...settings,
                    earliestDate: o.date })
                : new Date(earliestDate) < new Date(o.date)
                    ? settings
                    : (shouldSyncUserSettings.sync = true, {
                        ...settings,
                        earliestDate: o.date })
        }, shouldSyncUserSettings)

        return getEntryForm(o)
    },

    async startSleep({ data }) {
        let { date } = await validateObject(data, dateValidator)
        let now = new Date().toTimeString().slice(0, 5)
        date ??= dateToString(new Date())
        let dbData = await db.get<WeightData | undefined>(date)
        if (!dbData) {
            dbData = { date, _rev: 0 }
        }
        dbData.bedtime = now
        cleanWeightData(dbData)
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
        cleanWeightData(o)
        await db.set(o.date, o)
        return getWakeUp(o.bedtime, o.sleep)
    }
}

const getHandlers: RouteGetHandler = {
    async date({ query }) {
        let { date } = await validateObject(query, dateValidator)
        let data = (await db.get<WeightData | undefined>(date)) ?? { date, _rev: 0 }
        return getEntryForm(data)
    },

    async get({ query }) {
        return layout({
            main: await render(query),
            title: "Edit Entry"
        })
    },
}

const routes : RoutePage = {
    get: getHandlers,
    post: postHandlers
}

export default routes

