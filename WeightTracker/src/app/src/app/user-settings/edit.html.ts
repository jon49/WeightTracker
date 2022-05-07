import { DB, Module } from "globals"
import { formatNumber, isSelected, toNumber } from "../js/utils.js"

const { html, db: { get, set } } = app

const themes = ["dark", "light", "none"] as const
export type Theme = typeof themes[number]

const start = async () => {
    let o = await get("user-settings") ?? <DB.UserSettings>{}
    o.theme = getTheme(o.theme)
    return o
}

const render = (o: DB.UserSettings) => {
    const selected = isSelected<Theme>(o.theme)
    return {
    main: html`
<h2>User Settings</h2>
<p id=message></p>
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

function post(data: DB.UserSettings) {
    const o : DB.UserSettings = {
        earliestDate: data.earliestDate,
        goalWeight: toNumber(data.goalWeight),
        height: toNumber(data.height),
        theme: getTheme(data.theme)
    }
    return set("user-settings", o)
}

function getTheme(s: unknown) {
    return themes.find(x => x === s) ?? "none"
}

export default {
    get: async _ => {
        let settings = await start()
        return render(settings)
    },
    post: async (_, data, __) => {
        await post(data)
        return {
            partial: () => Promise.resolve(html`<p id=message>Saved!</p>`),
            redirect: "/app/user-settings/"
        }
    }
} as Module
