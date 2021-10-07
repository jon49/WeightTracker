// @ts-check

import { subscribe } from "./actions.js"

subscribe.set("error", async detail => {
    console.error(detail.message)
    console.log(detail.error)
})
