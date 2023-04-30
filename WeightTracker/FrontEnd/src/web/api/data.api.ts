import type { Self } from "../server/global.d.ts"
import { Route } from "../server/route"

const {
    http: { jsonResponse, searchParams },
    util: { },
    validation: { validateObject, createDateString },
    math: { dateFill },
    db: { getMany }
} = (<Self><any>self).app

const startQuery = {
    start: createDateString("Query Start")
}

export const route : Route = {
    async get(req: Request) {
        let query = searchParams(req)
        let { start } = await validateObject(query, startQuery)
        let split = start.split("-")
        let startDate = new Date(+split[0], +split[1] - 1, +split[2])
        let dates = dateFill(startDate, new Date())
        let data = await getMany(dates)
        return jsonResponse(data)
    }
}
