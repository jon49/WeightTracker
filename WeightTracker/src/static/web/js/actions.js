// @ts-check

/** @type {Map<string, () => Promise<void>>} */
export const route = new Map()

/**
 * @typedef ActionFunction
 * @type {({element: HTMLElement, event: string}) => Promise<void>}
 */

/**
 * @param {{has: (a: any) => boolean, get: (a: any) => any, set: (a: any, b: any) => void}} m
 * @param {ActionFunction} f
 * @param {string | HTMLElement} a
 */
function setFunction(m, f, a) {
    if (m.has(a)) {
        m.get(a).push(f)
    } else {
        m.set(a, [f])
    }
}

/**
 * @typedef SubscriptionFunction
 * @type {(detail: any) => Promise<void>}
 */

function Subscription() {
    /** @type {Map<string, SubscriptionFunction[]>} */
    const subscriptions = new Map()
    return {
        set: (/** @type {string} */ key, /** @type {{ (detail: any): Promise<void> }} */ f) => {
            if (subscriptions.has(key)) {
                subscriptions.get(key).push(f)
            } else {
                subscriptions.set(key, [f])
            }
        },
        get: (/** @type {string} */ key) => subscriptions.get(key),
        has: (/** @type {string} */ key) => subscriptions.has(key)
    }
}

const subscribe = Subscription()

class Action {
    /** @type {WeakMap<HTMLElement, ActionFunction[]>} */
    ref = new WeakMap()
    /** @type {Map<string, ActionFunction[]>} */
    action = new Map()
    /**
     * @param {string | HTMLElement} action
     * @param {ActionFunction} f
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
     * @returns {?ActionFunction[]}
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

    /**
     * @param {string} event
     * @param {any} detail
     * @param {{ wait: number; }} [options]
     */
    publish(event, detail, options) {
        if (options?.wait) {
            let timeout = setTimeout(_ => {
                document.dispatchEvent(new CustomEvent("jfn", { detail: { event, ...detail } }))
                clearTimeout(timeout)
            }, options.wait)
        } else {
            document.dispatchEvent(new CustomEvent("jfn", { detail: { event, ...detail } }))
        }
    }

    /**
     * @param {string} key 
     * @param {{ (detail: any): Promise<void> }} f 
     */
    subscribe(key, f) {
        subscribe.set(key, f)
    }
}

export const action = new Action()

/**
 * @param {HTMLElement} element
 * @param {string} event
 */
export function sendEvent(element, event) {
    element.dispatchEvent(new Event(event, { bubbles: true }))
}

window.addEventListener("hashchange", () =>
    route.has(location.hash)
        && route.get(location.hash)()
            .catch((/** @type {any} */ x) => action.publish("error", { error: x, message: `Routing handler failed - ${location.hash}` }))
)

document.addEventListener("jfn", async e => {
    // @ts-ignore
    const event = e?.detail?.event
    if (subscribe.has(event)) {
        for (const f of subscribe.get(event)) {
            f(e).catch(x => action.publish("error", { message: `Handling event "${event}"" failed.`, error: x }))
        }
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
            if (!key || debouncer.shouldSkip(key)) return
            Promise
                .all(action.get(key).map(f => f({ element: target, event: e.type })))
                .catch((/** @type {any} */ error) => action.publish("error", { error, message: `An element was not properly handled for the event ${e.type}.`, target: e.target }))
            preventDefault && e.preventDefault()
        }
    }

// @ts-ignore
document.addEventListener("change", handleEventActions(HTMLInputElement.name))
document.addEventListener("click", handleEventActions(HTMLButtonElement.name))
// @ts-ignore
document.addEventListener("submit", handleEventActions(HTMLFormElement.name, true))
