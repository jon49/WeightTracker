import { get, getMany, setMany, update, Updated } from "./js/db.js"
import { RoutePostArgs } from "./js/route.js"

async function post({ data: body }: RoutePostArgs) {
    try {
        let response = await fetch("/api/auth/logged-in")
        if (response.redirected) {
            let url = new URL(response.url)
            url.searchParams.append("returnUrl", body.url)
            return Response.redirect(url.href, 302)
        }
    } catch (error) {
        console.error("/api/auth/logged-in", { error, message: "Could not contact back end." })
        return Promise.reject({ message: "Could not sync. Are you online?" })
    }

    let updated = await get("updated") ?? new Map
    const keys : [string, number][] = Array.from(updated)
    const items = await getMany(keys.map(x => x[0]))
    const data : PostData[] = new Array(updated.size)
    for (let index = 0; index < items.length; index++) {
        /** @type {[string, number]} */
        let [key, timestamp] = keys[index]
        data[index] = { key, data: items[index], timestamp }
    }
    const lastSyncedId = /** @type {DB.Settings} */ (await get("settings"))?.lastSyncedId ?? 0

    let newData : {lastSyncedId: number, data: [string, any][]}
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
        console.error("/api/data", { error: res.statusText, message: "Could not sync data!" })
        return Promise.reject({ message: "Oops! Something happened and could not sync the data!" })
    }

    await setMany(newData.data)
    await Promise.all([
        update("settings", val => ({ ...val, lastSyncedId: newData.lastSyncedId }), { sync: false }),
        update("updated", (val: Updated) => (val?.clear(), val), { sync: false })])
    return Response.redirect(body.url, 302)
}

interface PostData {
    key: string
    data: any
    timestamp: number
}

export default {
    route: /\/sync\/$/,
    post
}
