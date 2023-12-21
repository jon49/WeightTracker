import { createDateString } from "@jon49/sw/validation.js"
import { dateFill } from "../../js/utils.js"
import * as db from "../../server/db.js"
import { Route } from "@jon49/sw/routes.js"
import { validateObject } from "promise-validation"

const startQuery = {
    start: createDateString("Query Start")
}

const routes: Route[] = [
    { route: /\/api\/chart-settings\/$/
    , async get() {
        let chartSettings = await db.get("chart-settings")
        return { json: chartSettings ?? null }
      }
    },
    { route: /\/api\/user-settings\/$/
    , async get() {
        let userSettings = await db.get("user-settings")
        return { json: userSettings ?? null }
      }
    },
    { route: /\/api\/data\/$/
    , async get({ query }) {
        let { start } = await validateObject(query, startQuery)
        let split = start.split("-")
        let startDate = new Date(+split[0], +split[1] - 1, +split[2])
        let dates = dateFill(startDate, new Date())
        let data = await db.getMany(dates)
        return { json: data }
      }
    },
]

export default routes

