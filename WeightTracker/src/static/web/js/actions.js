// @ts-check

/** @type {Map<string, () => Promise<void>>} */
export const route = new Map()

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
 * @param {{has: (a: any) => boolean, get: (a: any) => any, set: (a: any, b: any) => void}} m
 * @param {SubscribeFunction} f
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
    /** @type {WeakMap<HTMLElement, SubscribeFunction[]>} */
    ref = new WeakMap()
    /** @type {Map<string, SubscribeFunction[]>} */
    action = new Map()
    /**
     * @param {string | HTMLElement} action
     * @param {SubscribeFunction} f
     */
    set(action, f) {
        if (typeof action === "string")
        {
            setFunction(this.action, f, action)
        } else {
            setFunction(this.ref, f, action)
        }
    }

    /**
     * @param {string | HTMLElement} action
     * @returns {?SubscribeFunction[]}
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
 * @param {SubscribeFunction} f 
 */
export const subscribe = (event, f) => 
    action.set(event, f)

window.addEventListener("hashchange", () =>
    route.has(location.hash)
        && route.get(location.hash)()
            .catch((/** @type {any} */ x) => publish("error", { error: x, message: `Routing handler failed - ${location.hash}` }))
)

document.addEventListener("jfn", async e => {
    // @ts-ignore
    const event = e?.detail?.event
    if (action.has(event)) {
        Promise
        // @ts-ignore
        .allSettled(action.get(event).map(f => f(e.detail)))
        .then(xs => {
            for (let error of xs.filter(x => x.status === "rejected")) {
                // @ts-ignore
                publish("error", { message: `Handling event "${event}" failed.`, error })
            }
        })
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
                // @ts-ignore
                .allSettled(action.get(key).map(f => f({ element: target, event: e.type })))
                .then(xs => {
                    for (let fail of xs.filter(x => x.status === "rejected")) {
                        // @ts-ignore
                        publish("error", { error: fail.reason, message: `An element was not properly handled for the event ${e.type}.`, target, action: key })
                    }
                })
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
