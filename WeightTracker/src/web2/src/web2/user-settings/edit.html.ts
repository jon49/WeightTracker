import { formatNumber, isSelected, toNumber } from "../js/utils.js"
import html from "../js/html-template-tag.js"
import layout from "../_layout.html.js"
import * as db from "../js/db.js"
import { UserSettings } from "../js/db.js"
import { RoutePostArgs } from "../js/route.js"

const themes = ["dark", "light", "none"] as const
export type Theme = typeof themes[number]

const start = async () => {
    let o = await db.get("user-settings") ?? <UserSettings>{}
    o.theme = getTheme(o.theme)
    return o
}

const render = (o: UserSettings) => {
    const selected = isSelected<Theme>(o.theme)
    const option = (value: Theme, display: string) => html`<option value="${value}" ${selected(value)}>${display}</option>`
    return html`
<h2>User Settings</h2>
<p id=message></p>
<form method=POST>
    <label>Earliest Recorded Date:<br>
        <input autofocus name=earliestDate type=date value="${o.earliestDate}">
    </label><br><br>
    <label>Height (inches):<br>
        <input name=height type=number step=any value="${o.height ? formatNumber(o.height, 2) : null}">
    </label><br><br>
    <label>Goal Weight:<br>
        <input name=goalWeight type=number step=any value="${o.goalWeight ? formatNumber(o.goalWeight, 2) : null }">
    </label><br><br>
    <label>Theme:<br>
        <select name=theme required>
            ${option("dark", "Dark")}
            ${option("light", "Light")}
            ${option("none", "Default")}
        </select>
    </label><br><br>
    <button>Save</button>
</form>`
}

function post(data: UserSettings) {
    const o : UserSettings = {
        earliestDate: data.earliestDate,
        goalWeight: toNumber(data.goalWeight),
        height: toNumber(data.height),
        theme: getTheme(data.theme)
    }
    return db.set("user-settings", o)
}

function getTheme(s: unknown) {
    return themes.find(x => x === s) ?? "none"
}

async function get(req: Request) {
    let [settings, template] = await Promise.all([start(), layout(req)])
    return template({ main: render(settings) })
}

export default {
    route: /\/user-settings\/edit\/$/,
    get,
    async post({data, req}: RoutePostArgs) {
        await post(data)
        return get(req)
    }
}
