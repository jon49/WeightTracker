import { get as get1, getMany, setMany, set as set1, update as update1, clear } from "idb-keyval";
import { Theme } from "../api/settings.page.js";

const get: DBGet = get1;

// updatedId is how a key is stored in the "updated" set: arrays as JSON,
// anything else that isn't a string or number as a string.
function updatedId(key: unknown): string | number {
  if (Array.isArray(key)) return JSON.stringify(key);
  if (typeof key === "string" || typeof key === "number") return key;
  return String(key);
}

const _updated = async (key: IDBValidKey) => {
  await update1("updated", (val?: Updated) => (val || new Set()).add(updatedId(key)));
};

function set<K extends keyof DBAccessors>(
  key: K,
  value: DBAccessors[K],
  sync?: boolean,
): Promise<void>;
function set<T>(key: string | any[], value: T, sync?: boolean): Promise<void>;
async function set(key: string | any[], value: any, sync = true) {
  if (sync && "_rev" in value) {
    await _updated(key);
  }
  await set1(key, value);
}

function update<K extends keyof DBAccessors>(
  key: K,
  f: (val: DBAccessors[K]) => DBAccessors[K],
  options?: { sync: boolean },
): Promise<void>;
function update<T>(key: string, f: (val: T) => T, options?: { sync: boolean }): Promise<void>;
async function update(key: string, f: (v: any) => any, options = { sync: true }) {
  await update1(key, f);
  if (options.sync) {
    let o: any = await get(key);
    if (o && "_rev" in o) {
      await _updated(key);
    }
  }
}

interface DBAccessors {
  "user-settings": UserSettings;
  "chart-settings": ChartSettings;
  updated: Updated;
  settings: Settings;
}

export { update, set, get, getMany, setMany, clear, updatedId };

export interface WeightData extends Revision {
  date: string;
  weight?: number;
  bedtime?: string;
  sleep?: number;
  waist?: number;
  comments?: string;
}

export interface Settings {
  lastSyncedId?: number | undefined;
  theme?: Theme;
}

export interface UserSettings extends Revision {
  earliestDate: string | undefined;
  height: number | undefined;
  goalWeight: number | undefined;
  bedtime?: string;
}

export const durationUnits = ["month", "year", "week"] as const;
export type DurationUnit = (typeof durationUnits)[number];
export interface ChartSettings extends Revision {
  duration: number;
  durationUnit: DurationUnit;
}

export type Updated = Set<IDBValidKey>;

interface DBGet {
  (key: "user-settings"): Promise<UserSettings | undefined>;
  (key: "chart-settings"): Promise<ChartSettings | undefined>;
  (key: "updated"): Promise<Updated | undefined>;
  (key: "settings"): Promise<Settings | undefined>;
  <T>(key: string): Promise<T | undefined>;
}

export interface Revision {
  _rev: number;
}

export type FormReturn<T> = { [key in keyof T]: string | undefined };
export interface UserSettingsForm extends FormReturn<UserSettings> {}
export interface WeightDataForm extends FormReturn<WeightData> {}
export interface ChartSettingsForm extends FormReturn<ChartSettings> {}
