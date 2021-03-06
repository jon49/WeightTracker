import html from "./js/html-template-tag.js"
import * as db from "./js/db.js"
import { version } from "./settings.js"

const render = (theme: string | undefined, syncCount: number, url: string) => (o: LayoutTemplateArguments) => {
    const { main, head, script } = o
    return html`
<!DOCTYPE html>
<html>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weight Tracker</title>
    <link href="/web/css/index.v4.css" rel=stylesheet>
    ${head}
</head>
<body ${theme ? html`class=${theme}` : null}>
    <div id=messages></div>
    <a href="/login?handler=logout" style="position: absolute; top: 10px; right: 10px;">Logout</a>
    <header>
        <div class=sync>
            <h1 class=inline>Weight Tracker</h1>
            <form class=inline method=POST action="/web/sync/">
                <input type=hidden name=url value="${url}">
                <button>Sync&nbsp;-&nbsp;${""+syncCount}</button>
            </form>
        </div>
        <nav>
            <a href="/web/entries">Entries</a>
            | <a href="/web/entries/edit">Add/Edit</a>
            | <a href="/web/charts">Charts</a>
            | <a href="/web/user-settings/edit">User Settings</a>
        </nav>
    </header>
    <main>${main}</main>
    <footer><p>${version}</p></footer>
    ${ script
         ? html`<script src="${script}" type=module></script>`
       : null }
    <script src="/web/sw.js" async></script>
</body>
</html>`
}

const getSyncCount = async () => (await db.get("updated"))?.size ?? 0

export default
    async function layout(req: Request) {
        let [theme, count] = await Promise.all([db.get("settings"), getSyncCount()])
        return render(theme?.theme, count, req.url)
    }

export type Layout = typeof layout

export interface LayoutTemplateArguments {
    head?: Generator|string
    main?: Generator|string
    script?: string
}
