/// <reference types="../node_modules/@types/global" />
// @ts-check

import { publish, subscribe } from "./actions.js"
import { get, getMany, setMany, update } from "./db.js"
import { getById } from "./utils.js"
import html from "./hash-template.js"

// @ts-ignore
subscribe("error", async ({ message, error }) => {
    console.warn(message)
    console.log(error)
})

async function updateSyncButton() {
    const updated = /** @type {DB.Updated} */ (await get("updated"))
    const sync = /** @type {HTMLButtonElement} */ getById("sync")
    const s = `Sync - ${updated?.size ?? 0}`
    if (sync.innerText !== s) {
        sync.innerText = s
    }
}

subscribe("updated", updateSyncButton)
subscribe("data-synced", async _ => {
    publish("user-message", { message: "Data Synced!" })
    updateSyncButton()
})

/**
 * @typedef PostData
 * @property {string} key
 * @property {*} data
 * @property {number} timestamp
 */

subscribe("sync", { lock: true }, async _ => {
    let success = true
    await fetch("/api/auth/logged-in")
    .then(async response => {
        if (response.redirected) {
            window.location.href = `${response.url}?returnUrl=${location.pathname}`
        }
    })
    .catch(error => {
        publish("error", { error, message: "Could not contact back end." })
        publish("user-message", { message: "Could not sync. Are you online?" })
        success = false
    })
    if (!success) return
    const updated = /** @type {DB.Updated|undefined} */ (await get("updated")) ?? new Set
    /** @type {[string, number][]} */
    const keys = Array.from(updated)
    const items = await getMany(keys.map(x => x[0]))
    /** @type {PostData[]} */
    const data = new Array(updated.size)
    for (let index = 0; index < items.length; index++) {
        /** @type {[string, number]} */
        let [key, timestamp] = keys[index]
        data[index] = { key, data: items[index], timestamp }
    }
    const lastSyncedId = /** @type {DB.Settings} */ (await get("settings"))?.lastSyncedId ?? 0

    /** @type {{lastSyncedId: number, data: [string, any][]}} */
    let newData
    const res = await fetch("/api/data", {
        method: "POST",
        body: JSON.stringify({ lastSyncedId, data }),
        headers: {
            "Content-Type": "application/json"
        }
    })
    if (res.status >= 200 && res.status <= 299 && res.headers.get("Content-Type")?.startsWith("application/json")) {
        newData = await res.json()
    } else {
        publish("error", { error: res.statusText, message: "Could not sync data!" })
        publish("user-message", { message: "Oops! Something happened and could not sync the data!" })
        return
    }

    await setMany(newData.data)
    await update("settings", val => ({ ...val, lastSyncedId: newData.lastSyncedId }), { sync: false })
    await update("updated", (/** @type {DB.Updated} */val) => (val?.clear(), val), { sync: false })
    publish("data-synced", {})
})

const message = html`<snack-bar class=show><p slot=message class=message>#text</snack-bar>`
/**
 * @param {string} text
 */
function showSnackBar(text) {
    getById("messages").appendChild(message({text}).root)
}

// @ts-ignore
subscribe("user-message", async ({ message }) => {
    message && showSnackBar(message)
})

subscribe("start", async () => {

    updateSyncButton()

    // SERVICE WORKER

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/web/sw.js').then(function(registration) {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
                fetch("/web", { headers: {"sw-command": "getVersion"} })
                .then(x => {
                    if (x.headers.get("Content-Type")?.startsWith("application/json")) return x.json()
                    return Promise.reject("Not a JSON response.")
                })
                .then(x => {
                    if (x?.version) {
                        const $ = document.getElementsByTagName("footer")[0]
                        if (!$) return
                        $.innerHTML = `<p>Version ${x.version}</p>`
                    }
                })
                .catch(error => publish("error", {error, message: "Couldn't get version from service worker."}))
            }, function(error) {
                publish("error", { error, message: "Service worker registration failed!" })
            });
        });

        // navigator.serviceWorker.addEventListener("message", e => {
        //     if (e.data?.version) {
        //         const $ = document.getElementsByTagName("footer")[0]
        //         if (!$) return
        //         $.innerHTML = `<p>Version '${e.data.version}'</p>`
        //     }
        // })
        // if (navigator.serviceWorker?.controller?.postMessage) {
        //     navigator.serviceWorker.controller.postMessage({command: "getVersion"})
        // }
    }
})

publish("start", {})
