import layout, { themeView } from "../pages/_layout.html.js"
import globalDb from "./global-model.js"
import * as utils from "@jon49/sw/utils.js"
import html from "html-template-tag-stream"
import * as db from "./db.js"
import * as localUtils from "../js/utils.js"
import * as validation from "promise-validation"
import * as validators from "@jon49/sw/validation.js"
import * as charts from "../js/charts-shared.js"

let app = {
    charts,
    db,
    globalDb,
    html,
    layout,
    page: { themeView },
    utils: { ...utils, ...localUtils },
    validation: { ...validation, ...validators },
}

export type SharedApp = typeof app

Object.assign(self.app, app)

