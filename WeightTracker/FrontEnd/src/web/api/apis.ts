import { dateFill } from "../js/utils.v2"
import * as db from "../server/db"
import { jsonResponse, searchParams } from "../server/utils"
import { validateObject, createDateString } from "../server/validation"

const startQuery = {
    start: createDateString("Query Start")
}

export default [
    { route: /\/api\/chart-settings\/$/
    , async get() {
        let chartSettings = await db.get("chart-settings")
        return jsonResponse(chartSettings ?? null)
      }
    },
    { route: /\/api\/user-settings\/$/
    , async get() {
        let userSettings = await db.get("user-settings")
        return jsonResponse(userSettings ?? null)
      }
    },
    { route: /\/api\/data\/$/
    , async get(req: Request) {
        let query = searchParams(req)
        let { start } = await validateObject(query, startQuery)
        let split = start.split("-")
        let startDate = new Date(+split[0], +split[1] - 1, +split[2])
        let dates = dateFill(startDate, new Date())
        let data = await db.getMany(dates)
        return jsonResponse(data)
      }
    },
]


