import links from "../entry-points"
import { env } from "../settings"

interface RouteLocation {
    // Friendly name, e.g., `/web/my-page/` or `/web/css/main.css`
    name: string
    // Actual name, e.g., `/web/my-page.html.b3rs134c.js`
    pathname: string
}

const isPage = /\.(html|api)\./

const routes : RouteLocation[] =
    links
    .map(x => {
        let name : string
        if (isPage.test(x)) {
            name = x.slice(0, isPage.exec(x)?.index) + '/'
        } else {
            name = x
        }
        return {
            name,
            pathname: x
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

export function findRoute(name: string, method: unknown) {
    let validMethod : MethodTypes = isMethod(method)
    if (validMethod) {
        let route = routes.find(x => x.name === name)
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
