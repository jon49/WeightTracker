import { HTMLReturnType } from "./html-template-tag"

let routes : Route[] = []

export function addRoutes(routesList: Route[]) {
    routes = routesList
}

export type AddRoutes = typeof addRoutes

const methodTypes = ['get', 'post'] as const
type MethodTypes = typeof methodTypes[number] | null

function isMethod(method: unknown) {
    if (typeof method === "string" && methodTypes.includes(<any>method)) {
        return method as MethodTypes
    }
    return null
}

export function findRoute(route: string, method: unknown) {
    let validMethod : MethodTypes = isMethod(method)
    if (validMethod) {
        for (const r of routes) {
            if (r[validMethod] && r.route.test(route)) {
                return r[validMethod]
            }
        }
    }
    return null
}

interface RouteGet {
    (req: Request): Promise<HTMLReturnType>
}
export interface RoutePostArgs {
    data: any
    req: Request 
}
export interface RoutePost {
    (options: RoutePostArgs): Promise<HTMLReturnType>|Promise<Response>
}
interface Route {
    route: RegExp
    get?: RouteGet
    post?: RoutePost
}
