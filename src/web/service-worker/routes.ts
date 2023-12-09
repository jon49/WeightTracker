import chartEditHandler from "../pages/charts/edit.html.js"
import entriesEditHandler from "../pages/entries/edit.html.js"
import userSettingsEditHandler from "../pages/user-settings/edit.html.js"
import chartsHandler from "../pages/charts.html.js"
import entriesHandler from "../pages/entries.html.js"
import indexHandler from "../pages/index.html.js"
// import syncHandler from "../pages/sync.js"
import apis from "../pages/api/apis.js"
import { Route } from "@jon49/sw/routes.js"

export const routes : Route[] = [
    ...apis,
    chartEditHandler,
    entriesEditHandler,
    userSettingsEditHandler,
    chartsHandler,
    entriesHandler,
    indexHandler,
    // syncHandler,
]

