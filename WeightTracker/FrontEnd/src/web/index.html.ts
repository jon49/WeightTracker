import type { Self } from "./server/global.d.ts"
import { Route } from "./server/route"

const { layout, html } = (<Self><any>self).app

// @ts-ignore
const page : Route = {
    get: async (req: Request) => {
        let template = await layout(req)
        return template({ main: html`<p>Welcome to weight tracking!</p>` })
    }
}
