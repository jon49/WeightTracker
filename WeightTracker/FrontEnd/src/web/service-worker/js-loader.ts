import { version } from "../settings"

const loaded : Map<string, any> = new Map

function failNotFound() {
    return Promise.reject('Not found')
}

export default async function load(url: string) {
    if (loaded.has(url)) {
        return loaded.get(url)
    }
    let cache = await caches.open(version)
    let resp = await cache.match(url)
    if (!resp) return failNotFound()
    let text = await resp.text()
    text = text.trim()
    if (!text) return failNotFound()
    let js = new Function(text.replace('export {', 'return {'))
    let result = await js()
    loaded.set(url, result)
    return js()
}


