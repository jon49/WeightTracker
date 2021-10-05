// @ts-check

import { action, publish, form, subscribe, sendEvent } from "./actions.js"
import { get, set, update } from "./db.js"
import { dateToString, getById } from "./utils.js"

// @ts-ignore
form.set(getById("entry-form"), async f => {
    /** @type {{[key: string]: string}} */
    const raw = {}
    for (let input of new FormData(f)) {
        // @ts-ignore
        raw[input[0]] = input[1]
    }
    if (!/\d{4}-[01]\d-[0123]\d/.test(raw.date)) {
        console.error("Date is required!")
    }

    /** @type {WeightData} */
    const data = {
        bedtime: raw.bedtime,
        comments: raw.comments,
        date: raw.date,
        sleep: +raw.sleep || null,
        waist: +raw.waist || null,
        weight: +raw.weight || null,
    }
    await set(data.date, data)
    await update("settings", (/** @type {?Settings} */ settings) => {
        const earliestDate = settings?.earliestDate
        return !earliestDate
            ? { ...settings, earliestDate: data.date }
        : new Date(earliestDate) < new Date(data.date)
            ? settings
        : { ...settings, earliestDate: data.date }
    })

    publish("entry-updated", { date: data.date })
})

action.set(getById("entry-date"), async ({element}) => {
    /** @type {HTMLInputElement} */
    let e = element
    if (e.value?.length !== 10) return
    /** @type {?WeightData} */
    const data = await get(e.value)
    const $form = e.form
    $form["weight"].value = data?.weight ?? null
    $form["bedtime"].value = data?.bedtime ?? null
    $form["sleep"].value = data?.sleep ?? null
    $form["waist"].value = data?.waist ?? null
    $form["comments"].value = data?.comments ?? null
    getById("entry-message").innerHTML = "&nbsp;"
})

subscribe.set("entry-updated", async _ => {
    getById("entry-message").innerText = "Saved!"
})

export default async () => {
    /** @type {HTMLInputElement} */
    // @ts-ignore
    const $date = getById("entry-date")
    if ($date.value.length === 10) return
    $date.value = dateToString(new Date())
    sendEvent($date, "change")
}
