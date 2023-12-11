import { formatNumber, isSelected } from "../../js/utils.js"
import html from "html-template-tag-stream"
import layout from "../_layout.html.js"
import * as db from "../../server/db.js"
import { UserSettings, Settings } from "../../server/db.js"
import { Route, RoutePostHandler } from "@jon49/sw/routes.js"
import { createDateString, createIdNumber, createPositiveNumber, createString25, maybe } from "@jon49/sw/validation.js"
import { validateObject } from "promise-validation"

function getTheme(s: unknown): Theme {
    return themes.find(x => x === s) ?? "neither"
}

const themes = ["dark", "light", "neither"] as const
export type Theme = typeof themes[number]

async function render() {
    let [userSettings, settings] =
        await Promise.all([db.get("user-settings"), db.get("settings")])
    let { earliestDate, height, goalWeight } = userSettings ?? <UserSettings>{}
    let theme = getTheme(settings?.theme)
    settings = settings ?? <Settings>{}
    const selected = isSelected<Theme>(theme)
    const option = (value: Theme, display: string) => html`<option value="${value}" ${selected(value)}>${display}</option>`
    return html`
<h2>User Settings</h2>
<p id=message></p>
<form method=POST action="?handler=settings" onchange="this.requestSubmit()">
    <label>Theme:<br>
        <select name=theme required>
            ${option("dark", "Dark")}
            ${option("light", "Light")}
            ${option("neither", "Default")}
        </select>
    </label>
</form>

<br>

<form method=POST action="?handler=userSettings" onchange="this.requestSubmit()">
    <input name=earliestDate type=hidden value="${earliestDate}">
    <label>Height (inches):<br>
        <input name=height type=number step=any value="${height ? formatNumber(height) : null}">
    </label><br><br>
    <label>Goal Weight:<br>
        <input name=goalWeight type=number step=any value="${goalWeight ? formatNumber(goalWeight) : null}">
    </label><br><br>
</form>`
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

const postHandlers: RoutePostHandler = {
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
    async get() {
        return layout({
            main: await render(),
            title: "User Settings",
        })
    },
    post: postHandlers,
}

export default route
