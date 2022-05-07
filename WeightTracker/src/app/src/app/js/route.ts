import { HTMLReturnType } from "./html-template-tag"

const routes : Route[] = []

interface RouteFuncRequest {
}

type RouteMethod = "GET" | "POST"

interface Route {
    route: RegExp
    method: RouteMethod
    func: (req: RouteFuncRequest) => HTMLReturnType
}

export function addRoute(arg: Route) {
    routes.push(arg)
}

export type AddRoute = typeof addRoute

export function find(route: string, method: string) {
    for (const r of routes) {
        if (method === r.method && r.route.test(route)) {
            return r.func
        }
    }
    return null
}
