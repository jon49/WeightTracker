import layout from "../pages/_layout.html.js"
import globalDb from "./global-model.js"
import * as utils from "@jon49/sw/utils.js"
import html from "html-template-tag-stream"

self.app = self.app || {}

let app = {
    layout,
    globalDb,
    utils,
    html,
}

export type SharedApp = typeof app

Object.assign(self.app, app)

