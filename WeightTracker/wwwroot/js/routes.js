// @ts-check

import { route } from "./actions.js"
import chart from "./charts-page.js"
import entryPage from "./entry-page.js"

route.set("#charts", chart)
route.set("#add-entry", entryPage)

export default {}
