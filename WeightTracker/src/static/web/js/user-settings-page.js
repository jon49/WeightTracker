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
    getById("message").innerText = "Saved!"
    action.publish("clear-message", {}, { wait: 2e3 })
})

action.subscribe("clear-message", async _ => {
    getById("message").innerHTML = "&nbsp;"
})

;(async function() {
    /** @type {DB.UserSettings | undefined} */
    const settings = await get("user-settings")
    fillForm(form, settings)
})()
