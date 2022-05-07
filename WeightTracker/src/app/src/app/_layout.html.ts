import { PostHandler } from "globals"

const { html, db } = app

const syncButton = (count: number) =>
    html`<button id=sync data-action=sync>Sync - ${count}</button>`

const render = (theme: string | undefined, syncCount: number) => (o: LayoutTemplateArguments) => {
    const { main, head, script } = o
    return html`
<!DOCTYPE html>
<html>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weight Tracker</title>
    <link href="/app/css/index.css" rel=stylesheet>
    <link href="/app/css/snack-bar.css" rel=stylesheet>
    ${head}
</head>
<body ${theme ? html`class=${theme}` : null}>
    <div id=messages></div>
    <a href="/login?handler=logout" style="position: absolute; top: 10px; right: 10px;">Logout</a>
    <header>
        <h1>Weight Tracker</h1>
        <nav>
            <a href="/app/entries">Entries</a>
            | <a href="/app/entries/edit">Add/Edit</a>
            | <a href="/app/charts">Charts</a>
            | <a href="/app/user-settings/edit">User Settings</a>
        </nav>
        <br>${syncButton(syncCount)}
    </header>
    <main>${main}</main>
    <footer></footer>
    ${ script
         ? html`<script src="${script}" type=module></script>`
       : null }
    <script src="/app/js/snack-bar.js" async></script>
    <script src="/app/sw.js" async></script>
    <script src="/app/js/main.js"></script>
</body>
</html>`

}

const getSyncCount = async () => (await db.get("updated"))?.size ?? 0

export default {
    get: async _ => {
        let [theme, count] = await Promise.all([db.get("user-settings"), getSyncCount()])
        return render(theme?.theme, count)
    },
    post: async () => {
        let count = await getSyncCount()
        return {
            partial: () => Promise.resolve(syncButton(count)),
            redirect: null
        }
    }
} as LayoutTemplate

export interface LayoutTemplateArguments {
    head?: Generator|string
    main?: Generator|string
    script?: string
}

export interface LayoutTemplate {
    get: (req: Request) => Promise<(o: LayoutTemplateArguments) => Generator>
    post: PostHandler
}
