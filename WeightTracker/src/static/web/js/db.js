// @ts-check

// @ts-ignore
import { get, getMany, setMany, set as set1, update as update1 } from "./lib/db.min.js"

const _updated =
    async (/** @type {IDBValidKey} */ key) =>
        update1("updated", (/** @type {?Set} */ val) => (val || new Set()).add(key))
/**
 * @param {IDBValidKey} key
 * @param {*} value
 * @param {boolean} sync
 */
async function set(key, value, sync = true) {
    await set1(key, value)
    if (sync) {
        await _updated(key)
    }
}

/**
 * @template T
 * @param {IDBValidKey} key
 * @param {(val: T | undefined) => T} f
 * @param {{sync: boolean}} sync
 */
async function update(key, f, sync = { sync: true }) {
    await update1(key, f)
    if (sync.sync) {
        await _updated(key)
    }
}

export { update, set, get, getMany, setMany }
