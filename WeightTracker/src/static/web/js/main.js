// @ts-check

import { subscribe, action } from "./actions.js"
import 

subscribe.set("error", async({ detail }) => {
    console.error(detail.message)
    console.log(detail.error)
})

action.set("save", async _ => {
    const response = await fetch("/api/auth/logged-in")
    if (response.redirected) {
        window.location.href = response.url
    }
})


