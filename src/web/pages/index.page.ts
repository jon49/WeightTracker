import { RoutePage } from "@jon49/sw/routes.js"

let {
    html,
    layout,
    globalDb: db,
} = self.app

const route: RoutePage = {
    get: async ({ query }) => {
        if (query.login === "success") {
            db.setLoggedIn(true)
        }
        return layout({
            main: html`<p>Welcome to weight tracking!</p>`,
            title: "Weight Tracking",
        })
    }
}

export default route
