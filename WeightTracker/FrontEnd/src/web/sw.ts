import { addRoutes, findRoute, handleGet, handlePost, options, PostHandlers, RouteGet, RouteGetHandler, RoutePost } from "./server/route"
import chartEditHandler from "./charts/edit.html"
import entriesEditHandler from "./entries/edit.html"
import userSettingsEditHandler from "./user-settings/edit.html"
import chartsHandler from "./charts.html"
import entriesHandler from "./entries.html"
import indexHandler from "./index.html.js"
import syncHandler from "./sync"
import { version } from "./settings"
import { searchParams, reject } from "./server/utils"
import apis from "./api/apis"

options.searchParams = searchParams
options.reject = reject
options.redirect = (req: Request) => Response.redirect(req.referrer, 303)

addRoutes([
    ...apis,
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
        return (
            url.pathname.endsWith("sw.js") || !url.pathname.startsWith("/web/")
                ? fetch(req)
            : req.method === "POST"
                ? post(url, req)
            : get(url, req, event))
    } catch(error) {
        console.error("Get Response Error", error)
        return new Response("Oops something happened which shouldn't have!")
    }
}

async function get(url: URL, req: Request, event: FetchEvent) : Promise<Response> {
    if (!url.pathname.endsWith("/")) return cacheResponse(url.pathname, event)
    let handler =
        <RouteGet | RouteGetHandler | undefined>
        findRoute(url, req.method.toLowerCase())
    let resultTask = handleGet(handler, req)
    if (resultTask) {
        let result =
            await resultTask
            .catch(async (error: any) => {
                console.error("GET page error:", error, "\nURL:", url.toString())
                return new Response("Oops! Something happened which shouldn't have!")
            })

        if (result instanceof Response) {
            return result
        } else if (result) {
            return streamResponse(url.pathname, result)
        }
    }
    return new Response("Not Found!")
}

async function post(url: URL, req: Request) : Promise<Response> {
    let handler =
        <RoutePost | PostHandlers |null>
        findRoute(url, req.method.toLowerCase())
    // @ts-ignore
    if (handler) {
        try {
            const data = await getData(req)
            let result = await
                (handler instanceof Function
                    ? handler
                : handlePost(handler))({ req, data })

            if (result instanceof Response) {
                return result
            }
            if (result) {
                return streamResponse(url.pathname, result)
            }
        } catch (error) {
            console.error("Post error:", error, "\nURL:", url);
            return new Response(`Unknown error "${error}".`)
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
function streamResponse(url: string, generator: Generator | { body: Generator, headers?: any }) : Response {
    console.log(`Loading ${url}`)
    let { body, headers } = "body" in generator ? generator : { body: generator, headers: {} }
    const stream = new ReadableStream({
        start(controller : ReadableStreamDefaultController<any>) {
            for (let x of body) {
                if (typeof x === "string")
                    controller.enqueue(encoder.encode(x))
            }
            controller.close()
        }
    })

    return new Response(stream, { headers: { ...htmlHeader(), ...headers }})
}

/**
*  /my/url -> /my/url/
*  /my/script.js -> /my/script.js
*/
function normalizeUrl(url: string) : URL {
    let uri = new URL(url)
    let path = uri.pathname
    !uri.pathname.endsWith("/") && (uri.pathname = isFile(path) ? path : path+"/")
    return uri
}

function isFile(s: string) {
    return s.lastIndexOf("/") < s.lastIndexOf(".")
}

function htmlHeader() {
    return { "content-type": "text/html; charset=utf-8" }
}
