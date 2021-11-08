/**
 * @template T
 * @param {IDBValidKey} key
 * @param {(val: T | undefined) => T} f
 * @param {{sync: boolean}} sync
 */
export function update<T>(key: IDBValidKey, f: (val: T) => T, sync?: {
    sync: boolean;
}): Promise<void>;
/**
 * @param {IDBValidKey} key
 * @param {*} value
 * @param {boolean} sync
 */
export function set(key: IDBValidKey, value: any, sync?: boolean): Promise<void>;
import { get } from "./lib/db.min.js";
import { getMany } from "./lib/db.min.js";
import { setMany } from "./lib/db.min.js";
export { get, getMany, setMany };
