import { RoutePage } from "@jon49/sw/routes.js"

const {
    db,
} = self.app

const route: RoutePage =
    { async get() {
        let chartSettings = await db.get("chart-settings")
        return { json: chartSettings ?? null }
      } }

export default route

