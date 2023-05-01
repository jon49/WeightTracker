import { HTML } from "./html-template-tag"
import { Layout } from "../_layout.html"
import * as db from "./db"
import * as chart from "../js/charts.shared"
import * as http from "./http.ts"
import * as util from "./utils"
import * as validation from "./validation"
import load from "../service-worker/js-loader"

export interface App {
    html: HTML
    layout: Layout
    db: typeof db
    http: typeof http
    util: typeof util
    validation: typeof validation
    load: typeof load
}

export interface Self {
    app: App
}

