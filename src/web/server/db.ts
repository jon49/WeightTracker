import { get as get1, getMany, setMany, set as set1, update as update1 } from "idb-keyval"
import { Theme } from "../api/settings.js"

const get : DBGet = get1

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
    "user-settings": UserSettings
    "chart-settings": ChartSettings
    "updated": Updated
    "settings": Settings
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

export interface WeightData {
    date: string
    weight?: number
    bedtime?: string
    sleep?: number
    waist?: number
    comments?: string
}

export interface Settings {
    lastSyncedId?: number | undefined
    theme?: Theme
}

export interface UserSettings {
    earliestDate: string | undefined
    height: number | undefined
    goalWeight: number | undefined
}

export type DurationUnit = "month" | "year" | "week"
export interface ChartSettings {
    duration: number
    durationUnit: DurationUnit
}

export type Updated = Map<IDBValidKey, number>

interface DBGet {
    (key: "user-settings"): Promise<UserSettings | undefined>
    (key: "chart-settings"): Promise<ChartSettings | undefined>
    (key: "updated"): Promise<Updated | undefined>
    (key: "settings"): Promise<Settings | undefined>
    <T>(key: string): Promise<T | undefined>
}

export type FormReturn<T> = { [key in keyof T]: string|undefined }
export interface UserSettingsForm extends FormReturn<UserSettings> {}
export interface WeightDataForm extends FormReturn<WeightData> {}
export interface ChartSettingsForm extends FormReturn<ChartSettings> {}
