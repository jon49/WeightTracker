/// <reference types="../node_modules/@types/global" />
// @ts-check

import { action } from "./actions.js";
import { get, set } from "./db.js"
import { fillForm, getById, getFormData } from "./utils.js";

const form = document.forms[0]

action.set(form, async ({element: f}) => {
    if (!(f instanceof HTMLFormElement)) return
    /** @type {Form.UserSettings} */
    const raw = getFormData(f)
    /** @type {DB.UserSettings} */
    const data = {
        height: +raw.height || null,
        earliestDate: raw.earliestDate
    }
    await set("user-settings", data)
    action.publish("user-message", { message: "Saved!" })
})

async function fill() {
    fillForm(form, await get("user-settings"))
}

action.subscribe("data-synced", fill)

fill()
