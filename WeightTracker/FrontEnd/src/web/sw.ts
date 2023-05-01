import { version } from "./settings"
import { getResponse } from "./service-worker/route-handling"
import links from "./entry-points"
import { App } from "./server/global.d"
import html from "./server/html-template-tag"
import layout from "./_layout.html"
import * as db from "./server/db"
import * as http from "./server/http"
import * as util from "./server/utils"
import * as validation from "./server/validation"
import load from "./service-worker/js-loader"

const app : App = {
    html,
    layout,
    db,
    http,
    util,
    validation,
    load
}

// @ts-ignore
self.app = app

self.addEventListener("install", (e: Event) => {
    // @ts-ignore
    e.waitUntil(
        caches.open(version)
        .then((cache: any) => cache.addAll(links.map(x => x.pathname))))
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

