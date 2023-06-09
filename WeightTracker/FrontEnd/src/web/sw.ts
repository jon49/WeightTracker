import { version } from "./settings"
import { getResponse } from "./service-worker/route-handling"
import "./service-worker/routes"
import links from "./entry-points"

self.addEventListener("install", (e: Event) => {
    // @ts-ignore
    e.waitUntil(
        caches.open(version)
        .then((cache: any) => cache.addAll(links.map(x => x.file))))
})

// @ts-ignore
self.addEventListener("fetch", (e: FetchEvent) => e.respondWith(getResponse(e)))

// @ts-ignore
self.addEventListener("activate", async (e: ExtendableEvent) => {
    const keys = await caches.keys()
    // @ts-ignore
    e.waitUntil(Promise.all(
        keys
        .map((x: string) => ((version !== x) && caches.delete(x)))
        // @ts-ignore
        .filter(x => x)))
})

