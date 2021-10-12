/// <reference types="../node_modules/@types/global" />
// @ts-check

import { subscribe, action, publish } from "./actions.js"
import { get, getMany, setMany, update } from "./db.js"
import { getById } from "./utils.js"

subscribe.set("error", async({ detail }) => {
    console.error(detail.message)
    console.log(detail.error)
})

async function updateSyncButton() {
    const updated = /** @type {DB.Updated} */ (await get("updated"))
    const sync = /** @type {HTMLButtonElement} */ getById("sync")
    sync.innerText = `Sync - ${updated?.size ?? 0}`
}

subscribe.set("updated", updateSyncButton)
subscribe.set("data-synced", updateSyncButton)
updateSyncButton()

action.set("save", async _ => {
    const response = await fetch("/api/auth/logged-in")
    if (response.redirected) {
        window.location.href = response.url
    }
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
        publish("error", { error: res.statusText, message: "Could not sync data!" })
        return
    }

    await setMany(newData.data)
    await update("settings", val => ({ ...val, lastSyncedId: newData.lastSyncedId }), { sync: false })
    await update("updated", (/** @type {DB.Updated} */val) => (val.clear(), val), { sync: false })
    publish("data-synced", {})
})

