import { RoutePage, RoutePostHandler } from "@jon49/sw/routes.js"

const {
    globalDb: db,
    page: { themeView },
} = self.app

const themes = ["dark", "light", "neither"] as const
export type Theme = typeof themes[number]

const postHandlers: RoutePostHandler = {
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

const route: RoutePage = {
    post: postHandlers
}

export default route

