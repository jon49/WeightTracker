import { Theme } from "../api/settings.js";
import { Settings, get, set, update } from "./db.js";

function parseKey(key: unknown): string | number {
    return typeof key === "string" && key.startsWith("[")
        ? JSON.parse(key)
        : key
}

const settingDefaults: Settings = {
    lastSyncedId: 0,
    theme: "neither"
}

class GlobalDB {
    async updated(): Promise<(string | number)[]> {
        return Array.from((await get("updated")) ?? new Set).map(parseKey)
    }

    async setLoggedIn(loggedIn: boolean): Promise<void> {
        await set("loggedIn", loggedIn, false)
    }

    async isLoggedIn(): Promise<boolean> {
        return (await get("loggedIn")) ?? false
    }

    async settings(): Promise<Settings> {
        return { ...settingDefaults, ...((await get("settings")) ?? {}) }
    }

    async setTheme(theme: Theme): Promise<void> {
        await update(
            "settings",
            v => ({ ...(v ?? settingDefaults), theme }),
            { sync: false })
    }

}

const globalDB = new GlobalDB
export default globalDB

