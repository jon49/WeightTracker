import html from "html-template-tag-stream"
import layout from "./_layout.html.js"
import { Route } from "@jon49/sw/routes.js"

const route: Route = {
    route: /\/web\/?$/,
    get: async () => {
        return layout({
            main: html`<p>Welcome to weight tracking!</p>`,
            title: "Weight Tracking",
        })
    }
}

export default route
