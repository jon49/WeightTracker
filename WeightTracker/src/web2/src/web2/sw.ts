import { addRoutes, findRoute, RoutePost } from "./js/route.js"
import chartEditHandler from "./charts/edit.html.js"
import entriesEditHandler from "./entries/edit.html.js"
import userSettingsEditHandler from "./user-settings/edit.html.js"
import chartsHandler from "./charts.html.js"
import entriesHandler from "./entries.html.js"
import indexHandler from "./index.html.js"
import syncHandler from "./sync.js"
import { version } from "./settings.js"
import layout from "./_layout.html.js"

addRoutes([
    chartEditHandler,
    entriesEditHandler,
    userSettingsEditHandler,
    chartsHandler,
    entriesHandler,
    indexHandler,
    syncHandler,
])

const links : string[] = [] // File cache

self.addEventListener("install", (e: Event): void => {
    console.log(`Installing version '${version}' service worker.`)
    // @ts-ignore
    e.waitUntil(
        caches.open(version)
        .then((cache: any) => cache.addAll(links)))
})

// @ts-ignore
self.addEventListener("fetch", (e: FetchEvent) => e.respondWith(getResponse(e)))

// @ts-ignore
self.addEventListener("activate", async (e: ExtendableEvent) => {
    console.log(`Service worker activated. Cache version '${version}'.`)
    const keys = await caches.keys()
    // @ts-ignore
    e.waitUntil(Promise.all(
        keys
        .map((x: string) => ((version !== x) && caches.delete(x)))
        // @ts-ignore
        .filter(x => x)))
})

async function getResponse(event: FetchEvent): Promise<Response>  {
    try {
        const req : Request = event.request
        const url = normalizeUrl(req.url)
        if (url.endsWith("sw.js") || !url.startsWith("/web2/")) return fetch(req)
        if (req.method === "POST") return post(url, req)
        return get(url, req, event)
    } catch(error) {
        console.error("Get Response Error", error)
        return new Response("Oops something happened which shouldn't have!")
    }
}

async function get(url: string, req: Request, event: FetchEvent) : Promise<Response> {
    if (!url.endsWith("/") || isFile(url)) return cacheResponse(url, event)
    let handler = <(req: Request) => Promise<Generator<any, void, unknown>>|null>findRoute(url, req.method.toLowerCase())
    if (handler) {
        let result = await handler(req)
        if (result) {
            return streamResponse(url, result)
        }
    }
    return new Response("Not Found!")
}

async function post(url: string, req: Request) : Promise<Response> {
    let handler = <RoutePost|null>findRoute(url, req.method.toLowerCase())
    // @ts-ignore
    if (handler) {
        try {
            const data = await getData(req)
            let result = await handler({ req, data })
            if (result instanceof Response) {
                return result
            }
            if (result) {
                return streamResponse(url, result)
            }
            // return new Response("<meta http-equiv='refresh' content='0'>", { headers: htmlHeader()})
        } catch (error) {
            if (error && typeof error === "object" && error.hasOwnProperty("message")) {
                let template = await layout(req)
                // @ts-ignore
                streamResponse(url, template({ main: html`<p class=error>${error.message}</p>` }))
            } else {
                console.error("Unknown error during post.", error)
            }
        }
    }
    return new Response("Not Found!")
}

async function getData(req: Request) {
    let o : any = {}
    if (req.headers.get("content-type") === "application/x-www-form-urlencoded") {
        const formData = await req.formData()
        formData.forEach((val, key) => o[key] = val)
    } else if (req.headers.get("Content-Type")?.includes("json")) {
        o = await req.json()
    }
    return o
}

async function cacheResponse(url: string, event: { request: string | Request } | undefined) : Promise<Response> {
    const match = await caches.match(url)
    if (match) return match
    const res = await fetch(event?.request || url)
    if (!res || res.status !== 200 || res.type !== "basic") return res
    const responseToCache = res.clone()
    const cache = await caches.open(version)
    cache.put(url, responseToCache)
    return res
}

const encoder = new TextEncoder()
function streamResponse(url: string, gen: Generator) : Response {
    console.log(`Loading ${url}`)
    const stream = new ReadableStream({
        start(controller : ReadableStreamDefaultController<any>) {
            for (let x of gen) {
                if (typeof x === "string")
                    controller.enqueue(encoder.encode(x))
            }
            controller.close()
        }
    })

    return new Response(stream, { headers: htmlHeader()})
}

/**
*  /my/url -> /my/url/
*  /my/script.js -> /my/script.js
*/
function normalizeUrl(url: string) : string {
    let path = new URL(url).pathname
    !path.endsWith("/") && (path = isFile(path) ? path : path+"/")
    return path
}

function isFile(s: string) {
    return s.lastIndexOf("/") < s.lastIndexOf(".")
}

function htmlHeader() {
    return { "content-type": "text/html; charset=utf-8" }
}
