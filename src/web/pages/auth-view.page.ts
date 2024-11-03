import type { RoutePage } from "@jon49/sw/routes.js"

let {
    page: { loginView },
} = self.app

const route: RoutePage = {
    get() {
        return Promise.resolve(loginView())
    }
}

export default route

