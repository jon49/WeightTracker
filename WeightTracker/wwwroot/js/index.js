// @ts-check

import { subscribe, sendEvent } from "./actions.js"
import _ from "./routes.js"

subscribe.set("error", async detail => {
    console.error(detail.message)
    console.log(detail.error)
})

sendEvent(document.body, "hashchange")
