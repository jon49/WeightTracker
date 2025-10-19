import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js"
import sync from "../server/sync.js"

const { html } = self.app

let refresh = html`<x-refresh hz-target="#temp" hz-swap="append"></x-refresh>`

const postHandlers : RoutePostHandler = {
    async post() {
        let result = await sync()
        switch (result.status) {
            case 200:
                return {
                    status: 200,
                    body: refresh
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
                    message: "Synced!",
                    status: 200,
                    body: refresh
                }
            case 204:
                return {
                    message: "Synced!",
                    response: null,
                    body: refresh
                }
            case 401:
            case 403:
                return {
                    status: 401,
                    message: "You are not logged in!" }
            case 503:
                return {
                    status: 503,
                    message: "Hold your horses! You are syncing too fast!"
                }
            default:
                return {
                    status: 500,
                    message: "Unknown error!"
            }
        }
    }
}

const router: RoutePage = {
    post: postHandlers
}

export default router

