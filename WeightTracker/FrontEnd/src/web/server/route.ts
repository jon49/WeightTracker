import { HTML, HTMLReturnType } from "./html-template-tag"
import links from "../entry-points"

interface RouteLocation {
    name: string
    filename: string
    route?: Route
}
const routes : RouteLocation[] =
    links
    .filter(x => x.endsWith('.html.js') || x.endsWith('.api.js'))
    .map(x => {
        let i = x.lastIndexOf('.', x.length - 4)
        return {
            name: x.slice(0, i) + '/',
            filename: x
        }
    })

const methodTypes = ['get', 'post'] as const
type MethodTypes = typeof methodTypes[number] | null

function isMethod(method: unknown) {
    if (typeof method === "string" && methodTypes.includes(<any>method)) {
        return method as MethodTypes
    }
    return null
}

export function findRoute(url: URL, method: unknown) {
    let validMethod : MethodTypes = isMethod(method)
    if (validMethod) {
        let route = routes.find(x => x.name === url.pathname)
        if (route) {
            return {
                route: route,
                method: validMethod
            }
        }
    }
    return null
}

export interface RouteOptions {
    reject: (s: string | string[]) => Promise<void>
    redirect: (req: Request) => Response
    searchParams: <TReturn>(req: Request) => TReturn & { _url: URL }
}

const notImplemented = () => { throw new Error("Not Implemented") }

export const options : RouteOptions = {
    reject: notImplemented,
    redirect: notImplemented,
    searchParams: notImplemented
}

const o = options
export interface RoutePostArgsWithQuery extends RoutePostArgs {
    query: any
}

export type PostHandlers = Record<string, (o: RoutePostArgsWithQuery) => Promise<any>>
export function handlePost(handlers: PostHandlers) {
    return async (args: RoutePostArgs) => {
        let query = o.searchParams<{handler?: string}>(args.req)
        let extendedArgs = { ...args, query }
        let resultTask = query.handler && handlers[query.handler]
            ? handlers[query.handler](extendedArgs)
        : handlers["post"]
            ? handlers["post"](extendedArgs)
        : o.reject("I'm sorry, I didn't understand where to route your request.")

        let result = await resultTask
        if (result instanceof Promise) {
            await result
        }

        return result === undefined
                ? o.redirect(args.req)
            : result
    }
}

export function handleGet(handlers: RouteGetHandler | RouteGet | undefined | null, req: Request) {
    if (handlers == null) return
    if (handlers instanceof Function) {
        return handlers(req)
    }
    let query = o.searchParams<{handler?: string}>(req)
    let resultTask =
        query.handler && handlers[query.handler]
            ? handlers[query.handler](req)
        : handlers["get"]
            ? handlers["get"](req)
        : o.reject("I'm sorry, I couldn't find that page.")
    return resultTask
}

export interface RouteGet {
    (req: Request): Promise<HTMLReturnType> | Promise<Response>
}

export interface RouteGetHandler {
    [handler: string]: RouteGet
}

export interface RoutePostArgs {
    data: any
    req: Request 
}

export interface RoutePost {
    (options: RoutePostArgs): Promise<HTMLReturnType> | Promise<Response>
}

export interface Route {
    get?: RouteGet | RouteGetHandler
    post?: RoutePost | PostHandlers
}
