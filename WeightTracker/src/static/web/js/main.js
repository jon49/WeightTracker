/// <reference types="../node_modules/@types/global" />
// @ts-check

import { action } from "./actions.js"
import { get, getMany, setMany, update } from "./db.js"
import { getById } from "./utils.js"

action.subscribe("error", async({ detail }) => {
    console.error(detail.message)
    console.log(detail.error)
})

async function updateSyncButton() {
    const updated = /** @type {DB.Updated} */ (await get("updated"))
    const sync = /** @type {HTMLButtonElement} */ getById("sync")
    const s = `Sync - ${updated?.size ?? 0}`
    if (sync.innerText !== s) {
        sync.innerText = s
    }
}

action.subscribe("updated", updateSyncButton)
action.subscribe("data-synced", updateSyncButton)
updateSyncButton()

action.set("save", async _ => {
    let success = true
    await fetch("/api/auth/logged-in")
    .then(response => {
        if (response.redirected) {
            window.location.href = response.url
        }
    })
    .catch(error => {
        action.publish("error", { error, message: "Could not contact back end." })
        action.publish("user-message", { message: "Could not sync. Are you online?" })
        success = false
    })
    if (!success) return
    const updated = /** @type {DB.Updated|undefined} */ (await get("updated")) ?? new Set
    const keys = Array.from(updated)
    const items = await getMany(keys)
    const data = new Array(updated.size)
    for (let index = 0; index < items.length; index++) {
        data[index] = [keys[index], items[index]]
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
    if (res.status >= 200 && res.status <= 299) {
        newData = await res.json()
    } else {
        action.publish("error", { error: res.statusText, message: "Could not sync data!" })
        return
    }

    await setMany(newData.data)
    await update("settings", val => ({ ...val, lastSyncedId: newData.lastSyncedId }), { sync: false })
    await update("updated", (/** @type {DB.Updated} */val) => (val.clear(), val), { sync: false })
    action.publish("data-synced", {})
})

/**
 * @param {string} message
 */
function showSnackBar(message) {
    const $snack = document.createElement("snack-bar")
    $snack.classList.add("show")
    const $p = document.createElement("p")
    $p.setAttribute("slot", "message")
    $p.classList.add("message")
    $p.textContent = message
    $snack.append($p)
    getById("messages").append($snack)
}

action.subscribe("user-message", async ({ detail }) => {
    detail.message && showSnackBar(detail.message)
})

// SERVICE WORKER

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/web/sw.js').then(function(registration) {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, function(error) {
            action.publish("error", { error, message: "Service worker registration failed!" })
        });
    });
}
