import sync from "./api/sync.js"
import { Route } from "@jon49/sw/routes.js"
import chartEditHandler from "./pages/charts/edit.html.js"
import entriesEditHandler from "./pages/entries/edit.html.js"
import userSettingsEditHandler from "./pages/user-settings/edit.html.js"
import chartsHandler from "./pages/charts.html.js"
import entriesHandler from "./pages/entries.html.js"
import indexHandler from "./pages/index.html.js"
import localSettings from "./api/settings.js"
import apis from "./pages/api/apis.js"

const routes : Route[] = [
    ...apis,
    sync,
    localSettings,
    chartEditHandler,
    entriesEditHandler,
    userSettingsEditHandler,
    chartsHandler,
    entriesHandler,
    indexHandler,
]

// @ts-ignore
self.app.routes = routes
// @ts-ignore
self.app.version = "v0"

