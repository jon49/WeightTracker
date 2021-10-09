// @ts-check

// @ts-ignore
import { get, getMany, set as set1, update as update1 } from "./lib/db.min.js"

const _updated = async (/** @type {string} */ key) => update1("updated", (/** @type {?Set} */ val) => (val || new Set()).add(key))
/**
 * @param {string} key
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
 * @param {string} key
 * @param {(val: T) => T} f
 * @param {boolean} sync
 */
async function update(key, f, sync = true) {
    await update1(key, f)
    if (sync) {
        await _updated(key)
    }
}

export { update, set, get, getMany }
