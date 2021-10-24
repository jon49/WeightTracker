// @ts-check

import { publish, subscribe } from "./actions.js"
import { get, set } from "./db.js"
import { fillForm, getFormData, setDefaults } from "./utils.js"

const $form = document.forms[0]

subscribe("start", async _ => {
    /** @type {DB.ChartSettings} */
    const formData = setDefaults(await get("chart-settings"), [["duration", 9], ["durationUnit", "month"]])
    fillForm($form, formData)
})

subscribe($form, async _ => {
    /** @type {Form.ChartSettings} */
    const data = getFormData($form)
    /** @type {DB.ChartSettings} */
    const mappedData = {
        duration: +data.duration,
        // @ts-ignore
        durationUnit: ["month", "week", "year"].includes(data.durationUnit) ? data.durationUnit : "month"
    }
    await set("chart-settings", mappedData)
    publish("user-message", { message: "Saved!" })
})

subscribe($form.durationUnit, async ({element}) => {
    $form.duration.setAttribute("placeholder", `Number of ${element.value}s`)
})
