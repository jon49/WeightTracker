// @ts-check

import { action, publish, subscribe, sendEvent } from "./actions.js"
import { get, set, update } from "./db.js"
import { dateToString, getById } from "./utils.js"

// @ts-ignore
action.set(getById("entry-form"), async ({element: f}) => {
    if (!(f instanceof HTMLFormElement)) return
    /** @type {{[key: string]: string}} */
    const raw = {}
    for (let input of new FormData(f)) {
        // @ts-ignore
        raw[input[0]] = input[1]
    }
    if (!/\d{4}-[01]\d-[0123]\d/.test(raw.date)) {
        console.error("Date is required!")
    }

    /** @type {DB.WeightData} */
    const data = {
        bedtime: raw.bedtime,
        comments: raw.comments,
        date: raw.date,
        sleep: +raw.sleep || null,
        waist: +raw.waist || null,
        weight: +raw.weight || null,
    }
    await set(data.date, data)
    let shouldSyncUserSettings = { sync: false }
    await update("user-settings", (/** @type {?DB.UserSettings} */ settings) => {
        const earliestDate = settings?.earliestDate
        return !earliestDate
            ? (shouldSyncUserSettings.sync = true, { ...settings, earliestDate: data.date })
        : new Date(earliestDate) < new Date(data.date)
            ? settings
        : (shouldSyncUserSettings.sync = true, { ...settings, earliestDate: data.date })
    }, shouldSyncUserSettings)

    getById("entry-message").innerText = "Saved!"
    publish("clear-message", {}, { wait: 2e3 })
})

action.set(getById("entry-date"), async ({element}) => {
    /** @type {HTMLInputElement} */
    let e = element
    if (e.value?.length !== 10) return
    /** @type {?DB.WeightData} */
    const data = await get(e.value)
    const $form = e.form
    $form["weight"].value = data?.weight ?? null
    $form["bedtime"].value = data?.bedtime ?? null
    $form["sleep"].value = data?.sleep ?? null
    $form["waist"].value = data?.waist ?? null
    $form["comments"].value = data?.comments ?? null
})

subscribe.set("clear-message", async _ => {
    getById("entry-message").innerHTML = "&nbsp;"
})

;(async function start() {
    /** @type {HTMLInputElement} */
    // @ts-ignore
    const $date = getById("entry-date")
    if ($date.value.length === 10) return
    $date.value = dateToString(new Date())
    sendEvent($date, "change")
})()
