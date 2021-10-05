// @ts-check

// @ts-ignore
import { get, getMany, set as set1, update as update1 } from "https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm"

const _updated = async (/** @type {string} */ key) => update1("updated", (/** @type {?Set} */ val) => (val || new Set()).add(key))
/**
 * @param {string} key
 * @param {*} value
 */
async function set(key, value) {
    await set1(key, value)
    await _updated(key)
}

/**
 * @template T
 * @param {string} key
 * @param {(val: T) => T} f
 */
async function update(key, f) {
    await update1(key, f)
    await _updated(key)
}

export { update, set, get, getMany }
