// @ts-check

/** @type {Map<string, () => Promise<void>>} */
export const route = new Map()

/**
 * @param {{has: (a: any) => boolean, get: (a: any) => any, set: (a: any, b: any) => void}} m
 * @param {SubscribeOptions} f
 * @param {string | HTMLElement} a
 */
function setFunction(m, f, a) {
    if (m.has(a)) {
        m.get(a).push(f)
    } else {
        m.set(a, [f])
    }
}

class Action {
    /** @type {WeakMap<HTMLElement, SubscribeOptions[]>} */
    ref = new WeakMap()
    /** @type {Map<string, SubscribeOptions[]>} */
    action = new Map()
    /**
     * @param {string | HTMLElement} action
     * @param {SubscribeOptions} o
     */
    set(action, o) {
        if (typeof action === "string")
        {
            setFunction(this.action, o, action)
        } else {
            setFunction(this.ref, o, action)
        }
    }

    /**
     * @param {string | HTMLElement} action
     * @returns {?SubscribeOptions[]}
     */
    get(action) {
        return typeof action === "string"
            ? this.action.get(action)
        : this.ref.get(action)
    }

    /**
     * @param {string | HTMLElement} action
     * @returns {boolean}
     */
    has(action) {
        return typeof action === "string"
            ? this.action.has(action)
        : this.ref.has(action)
    }
}

const action = new Action()

/**
 * @param {string} event 
 * @param {HTMLElement|Object} data 
 * @param {{ wait: number }} [options]
 */
export const publish = (event, data, options) => {
    if (options?.wait) {
        let timeout = setTimeout(() => {
            sendEvent(event, data)
            clearTimeout(timeout)
        }, options.wait)
    } else {
        sendEvent(event, data)
    }
}

/**
 * @param {string|HTMLElement} event 
 * @param {{ lock: boolean }|SubscribeFunction} options
 * @param {SubscribeFunction} [f]
 */
export const subscribe = (event, options, f) => {
    if (typeof options === "function")
    {
        f = options
        options = { lock: false }
    }
    action.set(event, { f, ...options })
}

window.addEventListener("hashchange", () =>
    route.has(location.hash)
        && route.get(location.hash)()
            .catch((/** @type {any} */ x) => publish("error", { error: x, message: `Routing handler failed - ${location.hash}` }))
)

const lock = new Map
document.addEventListener("jfn", async e => {
    // @ts-ignore
    const event = e?.detail?.event
    if (action.has(event)) {
        Promise
        .allSettled(action.get(event).map(o => {
            if (o.lock) {
                if (lock.has(event)) return Promise.reject(`The event "${event}" is locked.`)
                let symbol = Symbol()
                lock.set(event, symbol)
                // @ts-ignore
                return o.f(e.detail).then(_ => ({symbol})).catch(error => ({error, symbol}))
            }
            // @ts-ignore
            return o.f(e.detail)
        }))
        .then(handleEventResults(event))
    } else {
        console.warn(`Unknown event send on the event bus. ${event}`)
        // @ts-ignore
        console.log(e.detail)
    }
})

class Debounce {
    /** @type {WeakMap<object, number>} */
    weak = new WeakMap()
    /** @type {Map<string, number>} */
    map = new Map()

    /**
     * @param {string | HTMLButtonElement | HTMLFormElement} key
     */
    shouldSkip(key) {
        if (!key) return false
        const isString = typeof key === "string"
        let lastUsed =
            isString
                ? this.map.get(key)
            : this.weak.get(key)
        if (!lastUsed) {
            const now = Date.now()
            if (isString) {
                this.map.set(key, now)
            } else {
                this.weak.set(key, now)
            }
            return false
        }
        return (Date.now() - lastUsed) < 250
    }

}

const debouncer = new Debounce()
const handleEventActions = (/** @type {string} */ type, /** @type {boolean} */ preventDefault = false) =>
    async function (/** @type {MouseEvent} */ e) {
        let target = e.target
        if (target && (target instanceof HTMLButtonElement || target instanceof HTMLInputElement || target instanceof HTMLFormElement) && target.constructor.name === type) {
            let key =
                action.has(target)
                    ? target
                : action.has(target.dataset.action)
                    ? target.dataset.action
                : null
            if (!key) {
                // @ts-ignore
                key = target.closest("[data-action]")?.dataset?.action
            }
            if (!key || debouncer.shouldSkip(key)) return
            Promise
                .allSettled(action.get(key).map(o => {
                    if (o.lock) {
                        if (lock.has(key)) return Promise.reject(`The event "${key}" is locked.`)
                        let symbol = Symbol()
                        lock.set(key, symbol)
                        // @ts-ignore
                        return o.f({ element: target, event: e.type })
                        .then(_ => ({symbol}))
                        .catch(error => ({error, symbol}))
                    }
                    // @ts-ignore
                    return o.f({ element: target, event: e.type })
                }))
                .then(handleEventResults(key))
            preventDefault && e.preventDefault()
        }
    }

// @ts-ignore
document.addEventListener("change", handleEventActions(HTMLInputElement.name))
document.addEventListener("click", handleEventActions(HTMLButtonElement.name))
// @ts-ignore
document.addEventListener("submit", handleEventActions(HTMLFormElement.name, true))

/**
 * @param {string} event 
 * @param {HTMLElement|Object} data 
 */
function sendEvent(event, data) {
    if (data instanceof HTMLElement) {
        data.dispatchEvent(new Event(event, { bubbles: true }))
    } else {
        document.dispatchEvent(new CustomEvent("jfn", { detail: { event, ...data } }))
    }
}

/**
 * @param {string | HTMLButtonElement | HTMLFormElement} event
 */
function handleEventResults(event) {
    return function handleEvent(/** @type {any} */ results) {
        for (let result of results) {
            if (result.status === "fulfilled") {
                // @ts-ignore
                removeLock(event, result.value?.symbol)
            } else {
                removeLock(event, result.reason?.symbol)
                // @ts-ignore
                delete result.reason.symbol
                publish("error", { message: `Handling event "${event}" failed.`, error: result.reason })
            }
        }
    }
}

/**
 * @param {string|HTMLElement} event
 * @param {Symbol|undefined} symbol
 */
function removeLock(event, symbol) {
    if (symbol && lock.get(event) === symbol) {
        lock.delete(event)
    }
}

/**
 * @typedef Subscribe
 * @property {HTMLButtonElement|HTMLFormElement|HTMLInputElement|undefined} element
 * @property {string | undefined} event
 * @property {any | undefined} detail
 */

/**
 * @typedef SubscribeFunction
 * @type {(d: Subscribe) => Promise<void>}
 */

/**
 * @typedef SubscribeOptions
 * @property {SubscribeFunction} f
 * @property {boolean} lock
 */

