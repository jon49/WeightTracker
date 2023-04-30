import type { Self } from "../server/global.d.ts"
import { Route } from "../server/route"

const {
    db: { get },
    http: { jsonResponse }
} = (<Self><any>self).app

export const route : Route = {
    async get() {
        let userSettings = await get("user-settings")
        return jsonResponse(userSettings ?? null)
    }
}
