import { DB, Module, ModuleStart } from "globals"
import { formatNumber, getFormData, isSelected, toNumber } from "../js/utils"

const { html, db: { get, set } } = app

const themes = ["dark", "light", "none"] as const
export type Theme = typeof themes[number]

let o : DB.UserSettings

const start : ModuleStart = async req => {
    if (req.headers.get("method") === "POST") {
        return post(await req.formData())
    }

    o = await get("user-settings") ?? <DB.UserSettings>{}
    o.theme = getTheme(o.theme)
}

const render = () => {
    const selected = isSelected<Theme>(o.theme)
    return {
    main: html`
<h2>User Settings</h2>

<form>
    <label>Earliest Recorded Date:<br><input name=earliestDate type=date value="${o.earliestDate}"></label><br><br>
    <label>Height (inches):<br><input name=height type=number step=any value="${formatNumber(o.height) || null}"></label><br><br>
    <label>Goal Weight:<br><input name=goalWeight type=number step=any value="${formatNumber(o.goalWeight) || null }"></label><br><br>
    <label>Theme:<br>
    <select name=theme required>
        <option value=dark ${selected("dark")}>Dark</option>
        <option value=light ${selected("light")}>Light</option>
        <option value=none ${selected("none")}>Default</option>
    </select></label><br><br>
    <button>Save</button>
</form>` }
}

function post(formData: FormData) {
    const form = getFormData<DB.UserSettings>(formData)
    const o : DB.UserSettings = {
        earliestDate: form.earliestDate,
        goalWeight: toNumber(form.goalWeight),
        height: toNumber(form.height),
        theme: getTheme(form.theme)
    }
    return set("user-settings", o)
}

function getTheme(s: unknown) {
    return themes.find(x => x === s) ?? "none"
}

export default {
    start, render
} as Module
