import type { Self } from "../server/global.d.ts"
import { Route } from "../server/route.js"

const {
    db: { get },
    http: { jsonResponse }
} = (<Self><any>self).app

// @ts-ignore
const page : Route = {
    async get() {
        let chartSettings = await get("chart-settings")
        return jsonResponse(chartSettings ?? null)
    }
}

