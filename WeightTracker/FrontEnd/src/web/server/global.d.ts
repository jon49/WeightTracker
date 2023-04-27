import { HTML } from "./html-template-tag"
import { Layout } from "../_layout.html"
import * as db from "./db"
import * as math from "../js/utils.v3"
import * as chart from "../js/charts-shared.v3.ts"
import * as http from "./http.ts"
import * as util from "./utils"
import * as validation from "./validation"

export interface Self {
    app: {
        html: HTML
        layout: Layout
        db: typeof db
        math: typeof math
        chart: typeof chart
        http: typeof http
        util: typeof util
        validation: typeof validation
    }
}

