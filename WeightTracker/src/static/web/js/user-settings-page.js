/// <reference types="../node_modules/@types/global" />
// @ts-check

import { action, publish, subscribe } from "./actions.js";
import { get, set } from "./db.js"
import { getById } from "./utils.js";

const form = document.forms[0]

action.set(form, async ({element: f}) => {
    if (!(f instanceof HTMLFormElement)) return
    const raw = {}
    for (let input of new FormData(f)) {
        // @ts-ignore
        raw[input[0]] = input[1]
    }
    /** @type {DB.UserSettings} */
    const data = {
        height: +raw.height || null,
        earliestDate: raw.earliestDate
    }
    await set("user-settings", data)
    getById("message").innerText = "Saved!"
    publish("clear-message", {}, { wait: 2e3 })
})

subscribe.set("clear-message", async _ => {
    getById("message").innerHTML = "&nbsp;"
})

;(async function() {
    /** @type {DB.UserSettings | undefined} */
    const settings = await get("user-settings")
    if (settings) {
        form.height.value = settings.height
        form.earliestDate.value = settings.earliestDate
    }
})()
