// @ts-check

import { publish, subscribe } from "./actions.js"
import { get, set, update } from "./db.js"
import { dateToString, fillForm, getById, getFormData } from "./utils.js"

// @ts-ignore
subscribe(getById("entry-form"), async ({element: f}) => {
    /** @type {Form.WeightData} */
    // @ts-ignore
    const raw = getFormData(f)
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

    publish("user-message", { message: "Saved!" })
})

subscribe(getById("entry-date"), async ({element}) => {
    /** @type {HTMLInputElement} */
    // @ts-ignore
    let e = element
    if (e.value?.length !== 10) return
    /** @type {?DB.WeightData} */
    const data = (await get(e.value)) || {
        date: e.value,
        bedtime: null,
        comments: null,
        sleep: null,
        waist: null,
        weight: null
    }
    fillForm(e.form, data)
})

subscribe("data-synced", async _ => {
    publish("change", getById("entry-date"))
})

subscribe("start", async _ => {
    /** @type {HTMLInputElement} */
    // @ts-ignore
    const $date = getById("entry-date")
    if ($date.value.length === 10) return
    $date.value = dateToString(new Date())
    publish("change", $date)
})
