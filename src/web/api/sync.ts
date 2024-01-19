import html from "html-template-tag-stream"
import { Route, RoutePostHandler } from "@jon49/sw/routes.js"
import sync from "../server/sync.js"
import db from "../server/global-model.js"
import { when } from "@jon49/sw/utils.js"

const postHandlers : RoutePostHandler = {
    async post() {
        let result = await sync()
        switch (result.status) {
            case 200:
                return {
                    status: 200,
                    events: { refresh: true }
                }
            default:
                return { status: 204, message: "" }
        }
    },
    async force() {
        let result = await sync()
        switch (result.status) {
            case 200:
                return {
                    status: 200,
                    events: { refresh: true }
                }
            case 204:
                return {
                    message: "Synced!",
                    response: null,
                    events: { refresh: true }
                }
            case 401:
            case 403:
                return {
                    status: 401,
                    message: "You are not logged in!" }
            default:
                return {
                    status: 500,
                    message: "Unknown error!"
            }
        }
    }
}

export function syncCountView(count: number) {
    return html`&#128259; ${when(count, count => html`(${count})`)}`
}

const router: Route = {
    route: /\/api\/sync\/$/,
    get: async () => {
        let updated = await db.updated()
        return syncCountView(updated.length)
    },
    post: postHandlers
}

export default router

