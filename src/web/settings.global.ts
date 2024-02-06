import sync from "./api/sync.js"
import { Route } from "@jon49/sw/routes.js"
import chartEditHandler from "./pages/charts/edit.html.js"
import entriesEditHandler from "./pages/entries/edit.html.js"
import userSettingsEditHandler from "./pages/user-settings/edit.html.js"
import chartsHandler from "./pages/charts.html.js"
import entriesHandler from "./pages/entries.html.js"
import localSettings from "./api/settings.js"
import apis from "./pages/api/apis.js"

self.app = self.app || {}

const routes : Route[] = [
    ...apis,
    sync,
    localSettings,
    chartEditHandler,
    entriesEditHandler,
    userSettingsEditHandler,
    chartsHandler,
    entriesHandler,
    { route: /\/web\/?$/,
      file: "/web/pages/index.page.js" }
]

let app = {
    version: "v99",
    routes,
}

export type SettingsApp = typeof app

Object.assign(self.app, app)
