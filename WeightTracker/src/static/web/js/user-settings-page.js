/// <reference types="../node_modules/@types/global" />
// @ts-check

import { action } from "./actions.js";
import { get, set } from "./db.js"
import { fillForm, getFormData, round } from "./utils.js";

const form = document.forms[0]

action.set(form, async ({element: f}) => {
    if (!(f instanceof HTMLFormElement)) return
    /** @type {Form.UserSettings} */
    const raw = getFormData(f)
    /** @type {DB.UserSettings} */
    const data = {
        height: +raw.height || null,
        earliestDate: raw.earliestDate,
        goalWeight: +raw.goalWeight
    }
    await set("user-settings", data)
    action.publish("user-message", { message: "Saved!" })
})

action.set(form.height, updateGoalWeight)

async function fill() {
    fillForm(form, await get("user-settings"))
    updateGoalWeight()
}

async function updateGoalWeight() {
    /** @type {DB.UserSettings} */
    let userSettings = await get("user-settings")
    if (userSettings.goalWeight || !userSettings.height) return
    let height = +form.height.value
    if (height <= 0) return
    let heightSquared = Math.pow(height, 2)
    let goalWeight = round(25 * heightSquared / 703, 2)
    form.goalWeight.value = goalWeight
}

action.subscribe("data-synced", fill)

fill()
