import { RoutePage } from "@jon49/sw/routes.js"

const {
    db,
} = self.app

const route: RoutePage =
    { async get() {
        let userSettings = await db.get("user-settings")
        return { json: userSettings ?? null }
      }
    }

export default route

