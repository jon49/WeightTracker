import html from "html-template-tag-stream"
import { Route, RoutePostHandler } from "@jon49/sw/routes.js"
import db from "../server/global-model.js"
import { Theme } from "../pages/user-settings/edit.html.js"

const defaultTheme = "⛅",
    lightTheme = "&#127774;",
    darkTheme = "&#127762;"

export function themeView(theme: Theme | undefined) {
    let image = theme === "light"
        ? lightTheme
    : theme === "dark"
        ? darkTheme
    : defaultTheme
    return html`<button class="bg">$${image}</button>`
}

const postHandlers : RoutePostHandler = {
    async theme({ req }) {
        let { theme } = await db.settings()
        theme =
            theme === "light"
                ? "dark"
            : theme === "dark"
                ? "neither"
            : "light"

        await db.setTheme(theme)

        if (req.headers.get("hf-request") === "true") {
            return {
                status: 200,
                body: themeView(theme),
                events: { "app-theme": { theme } }
            }
        }

        return undefined
    }
}

const route : Route = {
    route: /\/api\/settings\/$/,
    post: postHandlers
}

export default route

