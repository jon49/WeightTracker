import sync from "./api/sync.js"
import { Route } from "@jon49/sw/routes.js"
import userSettingsEditHandler from "./pages/user-settings/edit.html.js"
import localSettings from "./api/settings.js"
import apis from "./pages/api/apis.js"

self.app = self.app || {}

const routes : Route[] = [
    ...apis,
    sync,
    localSettings,
    userSettingsEditHandler,
    { route: /\/charts\/edit\/$/,
      file: "/web/pages/charts/edit.page.js" },
    { route: /\/charts\/$/,
      file: "/web/pages/charts.page.js",},
    { route: /\/entries\/edit\/$/,
      file: "/web/pages/entries/edit.page.js" },
    { route: /\/entries\/$/,
      file: "/web/pages/entries.page.js" },
    { route: /\/web\/?$/,
      file: "/web/pages/index.page.js" }
]

let app = {
    version: "v99",
    routes,
}

export type SettingsApp = typeof app

Object.assign(self.app, app)
