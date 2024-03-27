import { Route } from "@jon49/sw/routes.js"

self.app = self.app || {}

const routes : Route[] = [
    { route: /\/api\/data\/$/,
      file: "/web/api/data.page.js" },
    { route: /\/api\/user-settings\/$/,
      file: "/web/api/user-settings.page.js" },
    { route: /\/api\/chart-settings\/$/,
      file: "/web/api/chart-settings.page.js" },
    { route: /\/api\/sync\/$/,
      file: "/web/api/sync.page.js" },
    { route: /\/api\/settings\/$/,
      file: "/web/api/settings.page.js" },
    { route: /\/user-settings\/edit\/$/,
      file: "/web/pages/user-settings/edit.page.js" },
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
    version: "v103",
    routes,
}

export type SettingsApp = typeof app

Object.assign(self.app, app)
