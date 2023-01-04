import html from "./server/html-template-tag"
import layout from "./_layout.html"

export default {
    route: /\/web\/?$/,
    get: async (req: Request) => {
        let template = await layout(req)
        return template({ main: html`<p>Welcome to weight tracking!</p>` })
    }
}
