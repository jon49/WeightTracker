import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js";

const {
  globalDb: db,
  html,
  page: { themeView },
} = self.sw;

export type Theme = "dark" | "light" | "neither";

const postHandlers: RoutePostHandler = {
  async theme({ data }) {
    const submitted = (data as { theme?: string } | undefined)?.theme;
    const theme: Theme = submitted === "dark" ? "dark" : "light";

    await db.setTheme(theme);

    return {
      status: 200,
      body: html`${themeView(theme)}`,
    };
  },
};

const route: RoutePage = {
  post: postHandlers,
};

export default route;
