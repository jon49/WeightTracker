import { RoutePage } from "@jon49/sw/routes.middleware.js"

let {
    html,
    layout,
} = self.app

const route: RoutePage = {
    get: async () => {
        return layout({
            main: html`<p>Welcome to weight tracking!</p>`,
            title: "Weight Tracking",
        })
    }
}

export default route
