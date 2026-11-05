import { Theme } from "../api/settings.page.js";
import { Settings, Updated, get, getMany, set, update } from "./db.js";

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

function pendingKeys(updated: Updated | undefined): (string | number)[] {
  return Array.from(updated ?? new Set()).map(parseKey);
}

class GlobalDB {
  async updated(): Promise<(string | number)[]> {
    return pendingKeys(await get("updated"));
  }

  async updatedCount(): Promise<number> {
    return (await get("updated"))?.size ?? 0;
  }

  // pageState is what every page's header shows, in one read.
  async pageState(): Promise<{ isLoggedIn: boolean; updatedCount: number; settings: Settings }> {
    let [loggedIn, authToken, updated, settings] = await getMany([
      "loggedIn",
      "auth_token",
      "updated",
      "settings",
    ]);
    return {
      isLoggedIn: !!(loggedIn || authToken),
      updatedCount: (updated as Updated | undefined)?.size ?? 0,
      settings: { ...settingDefaults, ...(settings ?? {}) },
    };
  }

  async setLoggedIn(loggedIn: boolean): Promise<void> {
    await set("loggedIn", loggedIn, false);
    if (!loggedIn) {
      await this.clearAuthTokens();
    }
  }

  async isLoggedIn(): Promise<boolean> {
    let [loggedIn, authToken] = await getMany(["loggedIn", "auth_token"]);
    return !!(loggedIn || authToken);
  }

  async authTokens(): Promise<AuthTokens | undefined> {
    let [auth_token, refresh_token, csrf_token] = await getMany<string | undefined>([
      "auth_token",
      "refresh_token",
      "csrf_token",
    ]);
    if (!auth_token) return;
    return { auth_token, refresh_token: refresh_token ?? "", csrf_token };
  }

  async setAuthTokens(tokens: AuthTokens): Promise<void> {
    await Promise.all([
      set("auth_token", tokens.auth_token, false),
      set("refresh_token", tokens.refresh_token, false),
      tokens.csrf_token != null ? set("csrf_token", tokens.csrf_token, false) : Promise.resolve(),
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
