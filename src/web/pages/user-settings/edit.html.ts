import { formatNumber, isSelected, toNumber } from "../../js/utils.js"
import html from "html-template-tag-stream"
import layout from "../_layout.html.js"
import * as db from "../../server/db.js"
import { UserSettings, Settings } from "../../server/db.js"
import { PostHandlers, Route } from "@jon49/sw/routes.js"
import { createDateString, createIdNumber, createPositiveNumber, createString25, maybe } from "@jon49/sw/validation.js"
import { validateObject } from "promise-validation"

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

function getTheme(s: unknown) {
    return themes.find(x => x === s) ?? "none"
}

const settingsValidator = {
    lastSyncedId: maybe(createIdNumber("Last Synced Id")),
    theme: maybe(createString25("Theme")),
}

const userSettingsValidator = {
    earliestDate: maybe(createDateString("Earliest Date")),
    height: maybe(createPositiveNumber("Height")),
    goalWeight: maybe(createPositiveNumber("Goal Weight")),
}

const postHandlers: PostHandlers = {
    async settings({ data }) {
        let settings = await validateObject(data, settingsValidator)
        await db.update("settings", x => {

            let theme = { theme: getTheme(settings.theme) }
            if (!x) {
                return theme
            }
            return { ...x, ...theme }
        }, { sync: false })
        return { status: 204 }
    },

    async userSettings({ data }) {
        let o = await validateObject(data, userSettingsValidator)
        return db.set("user-settings", o)
    }
}

const route: Route = {
    route: /\/user-settings\/edit\/$/,
    async get({ req }) {
        let [settings, template] = await Promise.all([start(), layout(req)])
        return template({ main: render(settings) })
    },
    post: postHandlers,
}

export default route
