import html from "html-template-tag-stream"
import db from "../server/global-model.js"
import { when } from "@jon49/sw/utils.js"
import { Theme } from "../api/settings.page.js"

const defaultTheme = "⛅",
    lightTheme = "&#127774;",
    darkTheme = "&#127762;"

export function themeImage(theme: Theme | undefined) {
    return html`$${theme === "light"
        ? lightTheme
        : theme === "dark"
            ? darkTheme
            : defaultTheme}`
}

export function syncCountView(count: number) {
    return html`&#128259; ${when(count, count => html`(${count})`)}`
}

export function loginView() {
    return html`<a id=auth-link href="/login">Login</a>`
}

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
    }: LayoutTemplateArguments) => {
    const [isLoggedIn, updated, { theme }] = await Promise.all([
        db.isLoggedIn(),
        db.updated(),
        db.settings()
    ])
    const updatedCount = updated.length

    return html`
<!DOCTYPE html>
<html $${when(theme, x => x === "neither" ? null : `data-theme=${x}`)}>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Weight</title>
    <link rel="icon" type="image/x-icon" href="/web/images/weight.ico">
    <link href="/web/css/app.css" rel=stylesheet>
    <link rel="manifest" href="/web/manifest.json">
</head>
<body>
    <div id=head>$${head}</div>

    <div id=sw-message class=container></div>
    <header class="container">
        <nav role=navigation>
            <ul>
                <li>
                    <a href="/web/entries/edit"><img style="height:2.25em;" src="/web/images/weight.svg"></img></a>
                </li>
            </ul>
            <ul>
                <li>
                    <button form=post-form formaction="/web/api/settings?handler=theme" class="bg">$${themeImage(theme)}</button>

                    <button
                        form=post-form
                        formaction="/web/api/sync?handler=count"
                        formmethod=get
                        hidden

                        traits=x-subscribe
                        data-event="hf:completed"
                        data-match="detail: {method:'post'}"

                        hf-scroll-ignore
                        hf-target="#sync-count">
                    </button>

                    <button
                        id=sync-count
                        form=post-form
                        formaction="/web/api/sync?handler=force"
                        class=bg
                        >${syncCountView(updatedCount)}</button>

                    ${isLoggedIn
            ? html`<a id=auth-link href="/login?logout" role=button>Logout</a>`
            : loginView()}
                </li>
            </ul>
        </nav>

        <nav role=navigation>
            <ul>
                <li><a href="/web/entries">Entries</a></li>
                <li><a href="/web/entries/edit">Entry</a></li>
                <li><a href="/web/charts">Charts</a></li>
                <li><a href="/web/user-settings/edit">User Settings</a></li>
                ${when(nav?.length, () =>
                nav?.map(x => html`<li><a href="$${x.url}">${x.name}</a></li>`))}
            </ul>
        </nav>
    </header>

    <main class="container">
        ${main}
    </main>

    <template id=toast-template><dialog class=toast traits=x-toaster open><p class=message></p></dialog></template>
    <div id=toasts></div>
    <div id=dialogs></div>

    <footer class="container"></footer>

    <form
        action="/web/auth-view/"

        hidden
        traits=x-subscribe
        data-event="hf:response-error"
        data-match="detail: {xhr: { response: { status: 401 }}}"

        hf-scroll-ignore
        hf-swap=outerHTML
        hf-target="#auth-link">
    </form>

    <form
        hidden

        traits=x-subscribe
        data-event="refresh"
        data-action="setTimeout(() => location.reload(), 1e3)"
        >
    </form>

    <form id=post-form method=post hidden></form>

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
