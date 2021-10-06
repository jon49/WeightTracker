// @ts-check

/** @type {Map<string, () => Promise<void>>} */
export const route = new Map()
// /** @type {WeakMap<HTMLFormElement, (form: HTMLFormElement) => Promise<void>>} */
// export const form = new WeakMap()
/** @type {Map<string, (detail: any) => Promise<void>>} */
export const subscribe = new Map()

/**
 * @typedef ActionFunction
 * @type {({element: HTMLElement, event: string}) => Promise<void>}
 */

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
}

export const action = new Action()

/**
 * @param {string} event
 * @param {any} detail
 */
export function publish(event, detail) {
    document.dispatchEvent(new CustomEvent("jfn", { detail: { event, ...detail } }))
}

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
            .catch((/** @type {any} */ x) => publish("error", { error: x, message: `Routing handler failed - ${location.hash}` }))
)

document.addEventListener("jfn", async e => {
    // @ts-ignore
    const event = e.detail.event
    if (subscribe.has(event)) {
        // @ts-ignore
        subscribe.get(event)(e.detail).catch(x => publish("error", { message: `Handling event "${event}"" failed.`, error: x }))
    } else {
        console.warn(`Unknown event send on the event bus. ${event}`)
        // @ts-ignore
        console.log(e.detail)
    }
})

const handleEventActions = (/** @type {string} */ type, /** @type {boolean} */ preventDefault = false) =>
    async function (/** @type {MouseEvent} */ e) {
        let target = e.target
        if (target && (target instanceof HTMLButtonElement || target instanceof HTMLInputElement || target instanceof HTMLFormElement) && target.constructor.name === type) {
            let functions = action.get(target) || action.get(target.dataset.action)
            functions &&
                Promise.all(functions.map(f => f({element: target, event: e.type})))
                .catch((/** @type {any} */ error) => publish("error", { error, message: `An element was not properly handled for the event ${e.type}.`, target: e.target }))
            preventDefault && e.preventDefault()
        }
    }

// @ts-ignore
document.addEventListener("change", handleEventActions(HTMLInputElement.name))
document.addEventListener("click", handleEventActions(HTMLButtonElement.name))
// @ts-ignore
document.addEventListener("submit", handleEventActions(HTMLFormElement.name, true))
