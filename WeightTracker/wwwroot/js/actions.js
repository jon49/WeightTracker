// @ts-check

/** @type {Map<string, () => Promise<void>>} */
export const route = new Map()
/** @type {WeakMap<HTMLFormElement, (form: HTMLFormElement) => Promise<void>>} */
export const form = new WeakMap()
/** @type {Map<string, (detail: any) => Promise<void>>} */
export const subscribe = new Map()

class Action {
    ref = new WeakMap()
    action = new Map()
    /**
     * @param {string | HTMLElement} action
     * @param {({element: HTMLElement, event: string}) => Promise<void>} f
     */
    set(action, f) {
        if (typeof action === "string")
        {
            this.action.set(action, f)
        } else {
            this.ref.set(action, f)
        }
    }

    /**
     * @param {string | HTMLElement} action
     */
    get(action) {
        return (typeof action === "string")
            ? this.action.get(action)
        : this.ref.get(action)
    }

    /**
     * @param {string | HTMLElement} action
     */
    has(action) {
        return (typeof action === "string")
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

document.addEventListener("submit", async e => {
    let f
    if ((f = e.target) instanceof HTMLFormElement && form.has(f)) {
        e.preventDefault()
        form.get(f)(f)
            .catch(x => publish("error", { error: x, message: "Error handling submit." }))
    }
})

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

const handleEventActions = (/** @type {string} */ type) =>
    async function (/** @type {MouseEvent} */ e) {
        let target = e.target
        if (target && (target instanceof HTMLButtonElement || target instanceof HTMLInputElement) && target.constructor.name === type) {
            let func = action.get(target) || action.get(target.dataset.action)
            func &&
                func({element: target, event: e.type})
                .catch((/** @type {any} */ error) => publish("error", { error, message: `An element was not properly handled for the event ${e.type}.`, target: e.target }))
        }
    }

// @ts-ignore
document.addEventListener("change", handleEventActions(HTMLInputElement.name))
document.addEventListener("click", handleEventActions(HTMLButtonElement.name))
