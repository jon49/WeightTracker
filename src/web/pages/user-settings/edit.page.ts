import type { UserSettings, Settings } from "../../server/db.js"
import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.js"

const {
    db,
    html,
    layout,
    utils: { formatNumber },
    validation: {
        createDateString,
        createPositiveNumber,
        maybe,
        validateObject },
} = self.app

async function render() {
    let [userSettings, settings] =
        await Promise.all([db.get("user-settings"), db.get("settings")])
    let { earliestDate, height, goalWeight } = userSettings ?? <UserSettings>{}
    settings = settings ?? {} as Settings

    return html`
<h2>User Settings</h2>

<form method=post action="/web/user-settings/edit?handler=clearData">
<button>Clear All Data</button>
</form>

<br>

<form method=post action="/web/user-settings/edit?handler=userSettings" onchange="this.requestSubmit()">
    <input name=earliestDate type=hidden value="${earliestDate}">
    <label>Height (inches):<br>
        <input name=height type=number step=any value="${height ? formatNumber(height) : null}">
    </label><br><br>
    <label>Goal Weight:<br>
        <input name=goalWeight type=number step=any value="${goalWeight ? formatNumber(goalWeight) : null}">
    </label><br><br>
</form>`
}

const userSettingsValidator = {
    earliestDate: maybe(createDateString("Earliest Date")),
    height: maybe(createPositiveNumber("Height")),
    goalWeight: maybe(createPositiveNumber("Goal Weight")),
}

const postHandlers: RoutePostHandler = {
    async userSettings({ data }) {
        let o = await validateObject(data, userSettingsValidator)
        let original = await db.get("user-settings")
        if (!original) {
            original = { _rev: 0 } as UserSettings
        }
        if (!("_ref" in original)) {
            original._rev = 0
        }
        await db.set("user-settings", { ...original, ...o })
        return { status: 204 }
    },

    async clearData() {
        await db.clear()
        return { status: 204 }
    }
}

const route: RoutePage = {
    async get() {
        return layout({
            main: await render(),
            title: "User Settings",
        })
    },
    post: postHandlers,
}

export default route
