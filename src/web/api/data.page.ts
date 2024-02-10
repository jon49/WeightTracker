import { RoutePage } from "@jon49/sw/routes.js"

const {
    db,
    utils: { dateFill },
    validation: { createDateString, validateObject },
} = self.app

const startQuery = {
    start: createDateString("Query Start")
}

const route: RoutePage =
    { async get({ query }) {
        let { start } = await validateObject(query, startQuery)
        let split = start.split("-")
        let startDate = new Date(+split[0], +split[1] - 1, +split[2])
        let dates = dateFill(startDate, new Date())
        let data = await db.getMany(dates)
        return { json: data }
      } }

export default route

