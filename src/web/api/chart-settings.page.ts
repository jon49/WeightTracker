import type { RoutePage } from "@jon49/sw/routes.middleware.js";

const { db } = self.sw;

const route: RoutePage = {
  async get() {
    let chartSettings = await db.get("chart-settings");
    return { json: chartSettings ?? null };
  },
};

export default route;
