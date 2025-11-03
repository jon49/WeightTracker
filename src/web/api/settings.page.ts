import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js"

const {
    globalDb: db,
    html,
    page: { themeView },
} = self.app

const themes = ["dark", "light", "neither"] as const
export type Theme = typeof themes[number]

const postHandlers: RoutePostHandler = {
    async theme() {
        let { theme } = await db.settings()
        theme =
            theme === "light"
                ? "dark"
                : theme === "dark"
                    ? "neither"
                    : "light"

        await db.setTheme(theme)

        return {
            status: 200,
            body: html`${themeView(theme)}
            <x-theme hz-target="#temp" hz-swap="append" data-theme="${theme}"></x-theme>`,
        }
    }
}

const route: RoutePage = {
    post: postHandlers
}

export default route
