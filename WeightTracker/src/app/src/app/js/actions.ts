export const route : Map<string, () => Promise<void>> = new Map()

class Action {
    ref: WeakMap<HTMLElement, SubscribeOptions[]> = new WeakMap()
    action: Map<string, SubscribeOptions[]> = new Map()
    set(action: string | HTMLElement, o: SubscribeOptions) {
        if (typeof action === "string")
        {
            setFunction(this.action, o, action)
        } else {
            setFunction(this.ref, o, action)
        }
    }

    get(action: string | HTMLElement): SubscribeOptions[] | undefined {
        return typeof action === "string"
            ? this.action.get(action)
        : this.ref.get(action)
    }

    has(action: string | HTMLElement): boolean {
        return typeof action === "string"
            ? this.action.has(action)
        : this.ref.has(action)
    }
}

const action = new Action()

export const publish = (event: string, data: HTMLElement|Object, options?: { wait: number }) => {
    if (options?.wait) {
        let timeout = setTimeout(() => {
            sendEvent(event, data)
            clearTimeout(timeout)
        }, options.wait)
    } else {
        sendEvent(event, data)
    }
}

export const subscribe = (event: string|HTMLElement, options: { lock: boolean }|SubscribeFunction, f?: SubscribeFunction) => {
    if (typeof options === "function")
    {
        f = options
        options = { lock: false }
    }
    if (!f) return
    action.set(event, { f, ...options })
}

window.addEventListener("hashchange", () => {
    let f
    if (f = route.get(location.hash)) {
        f().catch((x: any) => publish("error", { error: x, message: `Routing handler failed - ${location.hash}` }))
    }
})

const lock = new Map
document.addEventListener("jfn", async e => {
    // @ts-ignore
    const event = e?.detail?.event
    let f
    if (f = action.get(event)) {
        Promise
        .allSettled(f.map(o => {
            if (o.lock) {
                if (lock.has(event)) return Promise.reject(`The event "${event}" is locked.`)
                let symbol = Symbol()
                lock.set(event, symbol)
                // @ts-ignore
                return o.f(e.detail)
                    .then(_ => ({symbol}))
                    .catch(error => Promise.reject({error, symbol}))
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
    weak : WeakMap<object, number> = new WeakMap()
    map : Map<string, number> = new Map()

    shouldSkip(key: string | HTMLButtonElement | HTMLFormElement | HTMLSelectElement) {
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
const handleEventActions = (types: string[], preventDefault = false) =>
    async function (e: MouseEvent) {
        let target = e.target
        if (target && ( target instanceof HTMLButtonElement
                     || target instanceof HTMLInputElement
                     || target instanceof HTMLFormElement
                     || target instanceof HTMLSelectElement ) && types.includes(target.constructor.name)) {
            let key =
                action.has(target)
                    ? target
                // @ts-ignore
                : action.has(target.dataset.action)
                    ? target.dataset.action
                : null
            if (!key) {
                // @ts-ignore
                key = target.closest("[data-action]")?.dataset?.action
            }
            // @ts-ignore
            if (!key || debouncer.shouldSkip(key)) return
            Promise
                // @ts-ignore
                .allSettled(action.get(key).map(o => {
                    if (o.lock) {
                        if (lock.has(key)) return Promise.reject(`The event "${key}" is locked.`)
                        let symbol = Symbol()
                        lock.set(key, symbol)
                        // @ts-ignore
                        return o.f({ element: target, event: e.type })
                        .then(_ => ({symbol}))
                        .catch(error => Promise.reject({error, symbol}))
                    }
                    // @ts-ignore
                    return o.f({ element: target, event: e.type })
                }))
                // @ts-ignore
                .then(handleEventResults(key))
            preventDefault && e.preventDefault()
        }
    }

// @ts-ignore
document.addEventListener("change", handleEventActions([ HTMLInputElement.name, HTMLSelectElement.name ]))
document.addEventListener("click", handleEventActions([HTMLButtonElement.name]))
// @ts-ignore
document.addEventListener("submit", handleEventActions([HTMLFormElement.name], true))

function sendEvent(event: string, data: HTMLElement|Object) {
    if (data instanceof HTMLElement) {
        data.dispatchEvent(new Event(event, { bubbles: true }))
    } else {
        document.dispatchEvent(new CustomEvent("jfn", { detail: { event, ...data } }))
    }
}

function handleEventResults(event: string | HTMLButtonElement | HTMLFormElement | HTMLSelectElement) {
    return function handleEvent(results: any) {
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

function removeLock(event: string|HTMLElement, symbol: Symbol|undefined) {
    if (symbol && lock.get(event) === symbol) {
        lock.delete(event)
    }
}

function setFunction(m: {has: (a: any) => boolean, get: (a: any) => any, set: (a: any, b: any) => void}, f: SubscribeOptions, a: string | HTMLElement) {
    if (m.has(a)) {
        m.get(a).push(f)
    } else {
        m.set(a, [f])
    }
}


interface Subscribe {
    el: HTMLButtonElement|HTMLFormElement|HTMLInputElement|undefined
    event?: string
    detail?: any
}

interface SubscribeFunction { (d: Subscribe): Promise<void> }

interface SubscribeOptions {
    f: SubscribeFunction
    lock: boolean
}
