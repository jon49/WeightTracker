import { formatNumber, isSelected, toNumber } from "../js/utils.v3"
import html from "../server/html-template-tag"
import layout from "../_layout.html"
import * as db from "../server/db"
import { UserSettings, Settings } from "../server/db"
import { RoutePostArgs } from "../server/route"
import { redirect } from "../server/utils"

const themes = ["dark", "light", "none"] as const
export type Theme = typeof themes[number]

const start = async () => {
    let [userSettings, settings] = await Promise.all([db.get("user-settings"), db.get("settings")])
    userSettings = userSettings ?? <UserSettings>{}
    settings = settings ?? <Settings>{}
    return { ...userSettings, theme: getTheme(settings.theme) }
}

const render = (o: UserSettings & { theme: Theme }) => {
    const selected = isSelected<Theme>(o.theme)
    const option = (value: Theme, display: string) => html`<option value="${value}" ${selected(value)}>${display}</option>`
    return html`
<h2>User Settings</h2>
<p id=message></p>
<form method=POST action="?handler=settings" onchange="this.submit()">
    <label>Theme:<br>
        <select name=theme required>
            ${option("dark", "Dark")}
            ${option("light", "Light")}
            ${option("none", "Default")}
        </select>
    </label>
</form>

<br>

<form method=POST action="?handler=userSettings" onchange="this.submit()">
    <input name=earliestDate type=hidden value="${o.earliestDate}">
    <label>Height (inches):<br>
        <input name=height type=number step=any value="${o.height ? formatNumber(o.height) : null}">
    </label><br><br>
    <label>Goal Weight:<br>
        <input name=goalWeight type=number step=any value="${o.goalWeight ? formatNumber(o.goalWeight) : null}">
    </label><br><br>
</form>`
}

function handleSetting(data: Settings) {
    return db.update("settings", x => {
        let theme = { theme: getTheme(data.theme) }
        if (!x) {
            return theme
        }
        return { ...x, ...theme }
    }, { sync: false })
}

function handleUserSettings(data: UserSettings) {
    const o: UserSettings = {
        earliestDate: data.earliestDate,
        goalWeight: toNumber(data.goalWeight),
        height: toNumber(data.height),
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

const handler = <any>{
    settings: handleSetting,
    userSettings: handleUserSettings,
}

export default {
    route: /\/user-settings\/edit\/$/,
    get,
    async post({ data, req }: RoutePostArgs) {
        let handlerType = new URL(req.url).searchParams.get("handler")
        let handle
        if (handlerType && (handle = handler[<any>handlerType])) {
            await handle(data)
        }
        return redirect(req)
    }
}
