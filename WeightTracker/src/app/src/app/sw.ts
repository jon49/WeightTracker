import html from "./js/html-template-tag.js"
import * as db from "./js/db.js"
import { addRoute } from "./js/route.js"
import { Module, PostResponse } from "globals"
import { LayoutTemplate } from "./_layout.html.js"

const version = "v0" as const
const links : string[] = [] // File cache

// @ts-ignore
self.app = { version, html, db, addRoute }

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

function getResponse(event: FetchEvent): Promise<Response>  {
    const req : Request = event.request
    const url = normalizeUrl(req.url)
    if (url.endsWith("sw.js") || !url.startsWith("/app/")) return fetch(req)
    if (req.method == "POST") return post(url, event)
    return get(url, event)
}

async function get(url: string, event: FetchEvent) : Promise<Response> {
    let link = getUrl(url)
    if (!(url.endsWith("/") && link.endsWith(".js"))) return cacheResponse(url, event)
    // TODO search for _layout.html.js instead that way I can change the layout by directory, similar to Razor
    // @ts-ignore
    // const [layout, main] : [LayoutTemplate, Module] = importScripts(getLayout(), import(link))
    // const request = event.request
    // const [layoutRender, body] = await Promise.all([layout.get(request), main.get(request)])
    // return streamResponse(url, [layoutRender(body)])
    return new Response("Empty Response")
}

async function post(url: string, event: FetchEvent) : Promise<Response> {
    let link = getUrl(url)
    if (!link.endsWith(".js")) {
        return cacheResponse(url, event)
    }
    const req = event.request
    // @ts-ignore
    const layoutImport = import(getLayout())
    const [layout, module] : [LayoutTemplate, Module] = await Promise.all([layoutImport, import(link)])
    if (module.post) {
        const data = await getData(req)
        const handler = (new URL(req.url)).searchParams.get("handler") ?? ""
        return streamPostResponse(url, await Promise.all([module, layout].map(x => x.post ? x.post(handler, data, req) : undefined)))
    }
    return cacheResponse(url, event)
}

function getLayout() : string {
    return "/app/_layout.html.js"
}

async function getData(req: Request) {
    let o : any = {}
    if (req.headers.get("Content-Type")?.includes("form-data")) {
        const formData = await req.formData()
        formData.forEach((val, key) => o[key] = val)
    } else if (req.headers.get("Content-Type")?.includes("json")) {
        o = await req.json()
    }
    return o
}

async function cacheResponse(url: string, event: { request: string | Request } | undefined) : Promise<Response> {
    // let hashUrl = links.find(x => x.startsWith("/sw/charts/edit"))
    const hashUrl = getUrl(url)
    const match = await caches.match(hashUrl)
    if (match) return match
    const res = await fetch(event?.request || url)
    if (!res || res.status !== 200 || res.type !== "basic") return res
    const responseToCache = res.clone()
    const cache = await caches.open(version)
    cache.put(url, responseToCache)
    return res
}

function streamResponse(url: string, gens: (Generator | undefined)[]) : Response {
    console.log(`Loading ${url}`)
    const stream = new ReadableStream({
        start(controller : ReadableStreamDefaultController<any>) {
            for (let gen of gens) {
                if (!gen) continue
                for (let x of gen) {
                    controller.enqueue(x)
                }
            }
            controller.close()
        }
    })

    return new Response(stream, { headers: { "content-type": "text/html; charset=utf-8" }})
}

async function streamPostResponse(url: string, gens: (PostResponse | undefined)[]) : Promise<Response> {
    console.log(`Loading ${url}`)
    if (!gens) {
        return new Response("", { status: 200 })
    }
    const redirect = gens.find(x => !x?.partial && x?.redirect)?.redirect
    return redirect
        ? new Response(null, {
            status: 302,
            headers: {
                location: redirect
            }
        })
    : streamResponse(url, await Promise.all(gens.map(x => x?.partial && x.partial())))
}

function getUrl(url: string) : string {
    let hashUrl
    if (url.endsWith("/")) {
        const url_ = url.slice(0, url.length - 1) + ".html"
        hashUrl = links.find(x => x.startsWith(url_)) ?? url
    }
    return hashUrl ?? url
}

/**
*  /my/url -> /my/url/
*  /my/script.js -> /my/script.js
*/
function normalizeUrl(url: string) : string {
    let path = new URL(url).pathname
    !path.endsWith("/") && (path = path.lastIndexOf("/") > path.lastIndexOf(".") ? path+"/" : path)
    return path
}
