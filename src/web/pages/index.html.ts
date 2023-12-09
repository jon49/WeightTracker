import html from "html-template-tag-stream"
import layout from "./_layout.html.js"

export default {
    route: /\/web\/?$/,
    get: async (req: Request) => {
        let template = await layout(req)
        return template({ main: html`<p>Welcome to weight tracking!</p>` })
    }
}
