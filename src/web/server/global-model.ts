import { Theme } from "../api/settings.page.js";
import { Settings, get, set, update } from "./db.js";

function parseKey(key: unknown): string | number {
  return typeof key === "string" && key.startsWith("[")
    ? JSON.parse(key)
    : (key as string | number);
}

const settingDefaults: Settings = {
  lastSyncedId: 0,
  theme: "neither",
};

export interface AuthTokens {
  auth_token: string;
  refresh_token: string;
  csrf_token?: string;
}

class GlobalDB {
  async updated(): Promise<(string | number)[]> {
    return Array.from((await get("updated")) ?? new Set()).map(parseKey);
  }

  async setLoggedIn(loggedIn: boolean): Promise<void> {
    await set("loggedIn", loggedIn, false);
    if (!loggedIn) {
      await this.clearAuthTokens();
    }
  }

  async isLoggedIn(): Promise<boolean> {
    if (await get("loggedIn")) return true;
    return !!(await get("auth_token"));
  }

  async authTokens(): Promise<AuthTokens | undefined> {
    let auth_token = await get<string>("auth_token");
    if (!auth_token) return;
    let refresh_token = (await get<string>("refresh_token")) ?? "";
    let csrf_token = await get<string>("csrf_token");
    return { auth_token, refresh_token, csrf_token };
  }

  async setAuthTokens(tokens: AuthTokens): Promise<void> {
    await Promise.all([
      set("auth_token", tokens.auth_token, false),
      set("refresh_token", tokens.refresh_token, false),
      tokens.csrf_token != null
        ? set("csrf_token", tokens.csrf_token, false)
        : Promise.resolve(),
      set("loggedIn", true, false),
    ]);
  }

  async clearAuthTokens(): Promise<void> {
    await Promise.all([
      set("auth_token", null, false),
      set("refresh_token", null, false),
      set("csrf_token", null, false),
    ]);
  }

  async settings(): Promise<Settings> {
    return { ...settingDefaults, ...((await get("settings")) ?? {}) };
  }

  async setTheme(theme: Theme): Promise<void> {
    await update("settings", (v) => ({ ...(v ?? settingDefaults), theme }), { sync: false });
  }
}

const globalDB = new GlobalDB();
export default globalDB;
