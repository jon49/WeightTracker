// @ts-check
const CACHE_NAME = "v12"

// self.addEventListener("message", e => {
//     if (e.data?.command === "getVersion") {
//         if (e.ports[0]) {
//             e.ports[0].postMessage({version: CACHE_NAME})
//         } else if (self.postMessage) {
//             self.postMessage({version: CACHE_NAME})
//         }
//     }
// })

self.addEventListener("install", e => {
    console.log(`Installing version '${CACHE_NAME}' service worker.`)
    // @ts-ignore
    e.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => {
            const links = createLinks("", {
                web: {
                    _files: ["index.html"],
                    css: { _files: ["index.css", "snack-bar.css"] },
                    js: { _files: [
                        "actions.js",
                        "charts-page.js",
                        "db.js",
                        "entry-page.js",
                        "h.js",
                        "main.js",
                        "snack-bar.js",
                        "user-settings-page.js",
                        "utils.js"],
                        lib: { _files: ["chart.min.js", "db-safari.js", "db.min.js"] }
                    },
                    entries: { edit: { _files: ["index.html"] }},
                    "user-settings": { edit: { _files: ["index.html"] } },
                    charts: { _files: ["index.html"] }
                } })
            return cache.addAll(links)
        }))
})

self.addEventListener("fetch", e => {
    // @ts-ignore
    e.respondWith(getResponse(e).then(x => x.res))
})

self.addEventListener("activate", async e => {
    console.log(`Service worker activated. Cache version '${CACHE_NAME}'.`)
    const keys = await caches.keys()
    // @ts-ignore
    e.waitUntil(Promise.all(
        keys
        .map(x => {
            if (CACHE_NAME !== x) return caches.delete(x)
        })
        .filter(x => x)))
})

/**
 * 
 * @param {string} root 
 * @param {{[K: string]: any, _files?: string[]}} links 
 * @param {string[]} files 
 * @returns {string[]}
 */
function createLinks(root, links, files = []) {
    if (links._files) {
        links._files.forEach(x => {
            if (!files) throw `Files must be an array but got '${files}'`
            if (x === "index.html") {
                files.push(`${root}/`)
            } else {
                files.push(`${root}/${x}`)
            }
        })
    }
    for (const link of Object.keys(links)) {
        if (link !== "_files") {
            createLinks(`${root}/${link}`, links[link], files)
        }
    }
    return files || []
}

/**
 * @param {*} event // FetchEvent
 * @returns {Promise<CacheResponse>}
 */
async function getResponse(event)  {
    /** @type {Request} */
    const req = event.request
    const url = normalizeUrl(req.url)
    let command
    if (command = req.headers.get("sw-command")) {
        if (command === "getVersion") return { url, res: new Response(JSON.stringify({version: CACHE_NAME}), { status: 200, headers: { "Content-Type": "application/json" } }) }
        return { url, res: new Response(null, {status: 400}) }
    }
    if (url.endsWith("sw.js") || req.method == "POST") return { url, res: await fetch(req) }
    return cacheResponse(url, event)
}

/**
 * @param {string} url 
 * @param {{ request: string | Request }?} event 
 * @returns {Promise<CacheResponse>}
 */
async function cacheResponse(url, event) {
    const match = await caches.match(url)
    if (match) return { url, res: match }
    const res = await fetch(event?.request || url)
    if (!res || res.status !== 200 || res.type !== "basic") return { url, res }
    const responseToCache = res.clone()
    const cache = await caches.open(CACHE_NAME)
    cache.put(url, responseToCache)
    return { url, res }
}

/**
 * 
 * @param {string} url 
 * @returns {string}
 */
function normalizeUrl(url) {
    let path = new URL(url).pathname
    !path.endsWith("/") && (path = path.lastIndexOf("/") > path.lastIndexOf(".") ? path+"/" : path)
    return path
}

/**
 * @typedef {Object} CacheResponse
 * @param {string} url
 * @param {Response} res
 */
