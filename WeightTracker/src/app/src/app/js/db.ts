import { get, getMany, setMany, set as set1, update as update1 } from "./lib/db.min.js"
import { publish } from "./actions.js"
import { DB } from "globals"

const _updated =
    async (key: string) => {
        await update1("updated", (val?: Map<string, number>) => {
            if (val instanceof Set) {
                let temp : Map<string, number> = new Map()
                Array.from(val).forEach(x => temp.set(x, 0))
                val = temp
            }
            return (val || new Map()).set(key, Date.now())
        })
        publish("updated", { key })
    }

function set<K extends keyof DBAccessors>(key: K, value: DBAccessors[K], sync?: boolean): Promise<void>
function set<T>(key: string, value: T, sync?: boolean): Promise<void>
async function set(key: string, value: any, sync = true) {
    await set1(key, value)
    if (sync) {
        await _updated(key)
    }
}

interface DBAccessors {
    "user-settings": DB.UserSettings
    "chart-settings": DB.ChartSettings
    "updated": DB.Updated
    "settings": DB.Settings
}

function update<K extends keyof DBAccessors>(key: K, f: (val: DBAccessors[K]) => DBAccessors[K], sync?: { sync: boolean }): Promise<void>
function update<T>(key: string, f: (val: T) => T, sync?: { sync: boolean }): Promise<void>
async function update(key: string, f: (v: any) => any, sync = { sync: true }) {
    await update1(key, f)
    if (sync.sync) {
        await _updated(key)
    }
}

export { update, set, get, getMany, setMany }
