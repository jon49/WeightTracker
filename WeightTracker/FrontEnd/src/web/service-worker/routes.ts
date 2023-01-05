import { addRoutes } from "../server/route"
import chartEditHandler from "../charts/edit.html"
import entriesEditHandler from "../entries/edit.html"
import userSettingsEditHandler from "../user-settings/edit.html"
import chartsHandler from "../charts.html"
import entriesHandler from "../entries.html"
import indexHandler from "../index.html.js"
import syncHandler from "../sync"
import apis from "../api/apis"

addRoutes([
    ...apis,
    chartEditHandler,
    entriesEditHandler,
    userSettingsEditHandler,
    chartsHandler,
    entriesHandler,
    indexHandler,
    syncHandler,
])

