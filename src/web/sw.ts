import { ValidationResult } from "promise-validation"
import { useRoutes, options } from "@jon49/sw/routes.middleware.js"
import { useHtmf } from "@jon49/sw/htmf.middleware.js"
import { useResponse } from "@jon49/sw/response.middleware.js"
import { swFramework } from "@jon49/sw/web-framework.js"

let version: string = self.app.version

swFramework.use(useRoutes)
swFramework.use(useHtmf)
swFramework.use(useResponse)

self.addEventListener("install", (e: Event) =>
    // @ts-ignore
    e.waitUntil(caches.open(version).then(cache =>
        // @ts-ignore
        cache.addAll(self.app.links.map(x => x.file))
    ).catch(e => console.error(e)))
)

function handleErrors(errors: any) {
    if (errors instanceof ValidationResult) {
        // @ts-ignore
        return errors.reasons.map(x => x.reason)
    }
    return []
}

// @ts-ignore
self.addEventListener("fetch", (e: FetchEvent) => {
    if (!options.handleErrors) {
        options.handleErrors = handleErrors
    }
    e.respondWith(swFramework.start(e))
})

// @ts-ignore
self.addEventListener("activate", async (e: ExtendableEvent) => {
    console.log("Service worker activated.")

    let keys = await caches.keys(),
        deleteMe =
            keys
                .map((x: string) => ((version !== x) && caches.delete(x)))
                .filter(x => x)
    if (deleteMe.length === 0) return
    e.waitUntil(Promise.all(deleteMe))
})

self.addEventListener('message', event => {
    if (event.data.action === 'skipWaiting') {
        // @ts-ignore
        return self.skipWaiting()
    }
});

