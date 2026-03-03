import { RoutePage } from "@jon49/sw/routes.middleware.js";

const { db } = self.sw;

const route: RoutePage = {
  async get() {
    let userSettings = await db.get("user-settings");
    return { json: userSettings ?? null };
  },
};

export default route;
