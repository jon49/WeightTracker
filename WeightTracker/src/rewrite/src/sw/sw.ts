const version = "v0" as const
const links : string[] = [] // File cache

// @ts-ignore
self.app = {
    version
}

self.addEventListener("install", (e: Event): void => {
    console.log(`Installing version '${version}' service worker.`)
    // @ts-ignore
    e.waitUntil(
        caches.open(version)
        .then((cache: any) => {
            return cache.addAll(links)
        }))
})

// @ts-ignore
self.addEventListener("fetch", (e: FetchEvent) => {
    e.respondWith(getResponse(e).then(x => x.res))
})

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

async function getResponse(event: FetchEvent): Promise<CacheResponse>  {
    const req : Request = event.request
    const url = normalizeUrl(req.url)
    let command
    if (command = req.headers.get("sw-command")) {
        if (command === "getVersion") {
            return {
                url,
                res: new Response(JSON.stringify({version}), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
            }
        }
        return { url, res: new Response(null, {status: 400}) }
    }
    if (url.endsWith("sw.js") || req.method == "POST") return { url, res: await fetch(req) }
    return cacheResponse(url, event)
}

async function cacheResponse(url: string, event: { request: string | Request } | undefined) : Promise<CacheResponse> {
    // let hashUrl = links.find(x => x.startsWith("/sw/charts/edit"))
    let hashUrl
    if (url.endsWith("/")) {
        const url_ = url.slice(0, url.length - 1) + ".html"
        hashUrl = links.find(x => x.startsWith(url_)) ?? url
    } else {
        hashUrl = url
    }
    const match = await caches.match(hashUrl)
    if (match) return { url, res: match }
    const res = await fetch(event?.request || url)
    if (!res || res.status !== 200 || res.type !== "basic") return { url, res }
    const responseToCache = res.clone()
    const cache = await caches.open(version)
    cache.put(url, responseToCache)
    return { url, res }
}

function normalizeUrl(url: string) : string {
    let path = new URL(url).pathname
    !path.endsWith("/") && (path = path.lastIndexOf("/") > path.lastIndexOf(".") ? path+"/" : path)
    // if (path.endsWith("/")) {
    //     path += `?_=${version}`
    // }
    return path
}

interface CacheResponse {
    url: string
    res: Response
}
