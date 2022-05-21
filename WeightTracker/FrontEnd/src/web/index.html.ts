import html from "./js/html-template-tag.js"
import layout from "./_layout.html.js"

export default {
    route: /\/web\/?$/,
    get: async (req: Request) => {
        let template = await layout(req)
        return template({ main: html`<p>Welcome to weight tracking!</p>` })
    }
}
