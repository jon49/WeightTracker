import html from "html-template-tag-stream"
import db from "../server/global-model.js"
import { when } from "@jon49/sw/utils.js"
import { Theme } from "../api/settings.page.js"

const defaultTheme = "⛅",
    lightTheme = "&#127774;",
    darkTheme = "&#127762;"

export function themeView(theme: Theme | undefined) {
    let image = theme === "light"
        ? lightTheme
        : theme === "dark"
            ? darkTheme
            : defaultTheme
    return html`<button class="bg">$${image}</button>`
}

export function syncCountView(count: number) {
    return html`&#128259; ${when(count, count => html`(${count})`)}`
}

export function loginView() {
    return html`<a id=auth-link href="/login">Login</a>`
}

const {
    version
} = self.app

interface Nav {
    name: string
    url: string
}

const render = async (
    { main,
        head,
        scripts,
        nav,
        title,
        bodyAttr,
    }: LayoutTemplateArguments) => {
    const [isLoggedIn, updated, { theme }] = await Promise.all([
        db.isLoggedIn(),
        db.updated(),
        db.settings()
    ])
    const updatedCount = updated.length

    return html`
<!DOCTYPE html>
<html>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Weight</title>
    <link rel="icon" type="image/x-icon" href="/web/images/weight.ico">
    <link href="/web/css/app.css" rel=stylesheet>
    <link rel="manifest" href="/web/manifest.json">
</head>
<body $${when(theme, x => `class=${x}`)} $${bodyAttr}>
    <div id=head>$${head}</div>
    <header>
        <div id=sw-message></div>
        <div class=flex>
            <a href="/web?hz" target=htmz><img style="height:2.25em;" src="/web/images/weight.svg"></img></a>
            <div class=flex>
                <form method=post action="/web/api/settings?handler=theme" class=inline>
                    ${themeView(theme)}
                </form>

               <form method=post action="/web/api/sync?handler=force" class=inline>
                   <button id=sync-count class=bg>${syncCountView(updatedCount)}</button>
               </form>

                ${isLoggedIn
                    ? html`<a id=auth-link href="/login?logout">Logout</a>`
                    : loginView()}
            </div>
        </div>
        <nav id=nav-main>
            <ul>
                <li><a href="/web/entries?hz" target=htmz>Entries</a></li>
                <li><a href="/web/entries/edit?hz" target=htmz>Entry</a></li>
                <li><a href="/web/charts?hz" target=htmz>Charts</a></li>
                <li><a href="/web/user-settings/edit?hz" target=htmz>User Settings</a></li>
                ${when(nav?.length, () =>
                       nav?.map(x => html`<li><a href="$${x.url}?hz" target=htmz>${x.name}</a></li>`))}
            </ul>
        </nav>
    </header>
    <main>
        ${main}
    </main>

    <template id=toast-template><dialog class=toast is=x-toaster open><p class=message></p></dialog></template>
    <div id=toasts></div>
    <div id=dialogs></div>

    <footer><p>${version}</p></footer>

    <form
        is=form-subscribe
        data-event="refresh"
        hf-ignore
        target=htmz>
        <input type=hidden name=hz>
    </form>

    <form
        id=get-sync-count-form
        action="/web/api/sync?handler=count"

        is=form-subscribe
        data-event="hf:completed"
        data-match="detail: {method:'post'}"

        hf-scroll-ignore
        hf-target="#sync-count">
    </form>

    <form
        action="/web/auth-view/"

        hidden
        is=form-subscribe
        data-event="hf:response-error"
        data-match="detail: {xhr: { response: { status: 401 }}}"

        hf-scroll-ignore
        hf-swap=outerHTML
        hf-target="#auth-link">
    </form>

    <script src="/web/js/app.bundle.js" type=module></script>
    <div id=scripts>${(scripts ?? []).map(x => html`<script src="${x}" ${when(!x.includes('.min.'), 'type=module')}></script>`)}</div>
</body>
</html>`
}

export default
    async function layout(o: LayoutTemplateArguments) {
    return render(o)
}

export type Layout = typeof layout

export interface LayoutTemplateArguments {
    title: string
    head?: string
    bodyAttr?: string
    main?: AsyncGenerator<any, void, unknown>
    scripts?: string[]
    nav?: Nav[]
}

