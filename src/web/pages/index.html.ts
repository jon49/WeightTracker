import html from "html-template-tag-stream"
import layout from "./_layout.html.js"
import { Route } from "@jon49/sw/routes.js"
import db from "../server/global-model.js"

const route: Route = {
    route: /\/web\/?$/,
    get: async ({ query }) => {
        if (query.login === "success") {
            db.setLoggedIn(true)
        }
        return layout({
            main: html`<p>Welcome to weight tracking!</p>`,
            title: "Weight Tracking",
        })
    }
}

export default route
