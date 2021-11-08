import { LayoutTemplate, ModuleRenderReturn } from "globals"

const { html, db } = app

let theme : string | undefined

const start = async () => {
    theme = (await db.get("user-settings"))?.theme
}

interface Render { (o: ModuleRenderReturn) : Generator }
const render : Render = o => {
    if (!("main" in o)) {
        o = { main: o }
    }
    const { main, head, script } = o
    return html`
<!DOCTYPE html>
<html>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weight Tracker</title>
    <link href="/web/css/index.css" rel=stylesheet>
    <link href="/web/css/snack-bar.css" rel=stylesheet>
    ${head}
</head>
<body ${theme ? html`class=${theme}` : null}>
    <div id=messages></div>
    <a href="/login?handler=logout" style="position: absolute; top: 10px; right: 10px;">Logout</a>
    <header>
        <h1>Weight Tracker</h1>
        <nav>
            <a href="/web/entries">Entries</a>
            | <a href="/web/entries/edit">Add/Edit</a>
            | <a href="/web/charts">Charts</a>
            | <a href="/web/user-settings/edit">User Settings</a>
        </nav>
        <br><button id=sync data-action=sync>Sync - 0</button>
    </header>
    <main>${main}</main>
    <footer></footer>
    ${ script
         ? html`<script src="${script}" type=module></script>`
       : null }
    <script src="/web/js/snack-bar.js" async></script>
    <script src="/web/sw.js" async></script>
    <script src="/web/js/main.js" defer type=module></script>
</body>
</html>`

}

export default {
    start, render
} as LayoutTemplate
