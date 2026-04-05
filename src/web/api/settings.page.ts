import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js";

const {
  globalDb: db,
  html,
  page: { themeView },
} = self.sw;

export type Theme = "dark" | "light" | "neither";

const postHandlers: RoutePostHandler = {
  async theme() {
    let { theme } = await db.settings();
    theme = theme === "dark" ? "light" : "dark";

    await db.setTheme(theme);

    return {
      status: 200,
      body: html`${themeView(theme)}
            <i _load=theme hz-target="#temp" hz-swap="append" data-theme="${theme}"></i>`,
    };
  },
  async initTheme({ query }) {
    const theme: Theme = query.theme === "dark" ? "dark" : "light";

    await db.setTheme(theme);

    return {
      status: 200,
      body: html`${themeView(theme)}
            <i _load=theme hz-target="#temp" hz-swap="append" data-theme="${theme}"></i>`,
    };
  },
};

const route: RoutePage = {
  post: postHandlers,
};

export default route;
