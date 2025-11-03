import "html-traits"
import "@jon49/web/x-toaster.js"
import "@jon49/web/login.js"
import "@jon49/web/app-updater.js"
import "@jon49/sw/new-app-notifier.js"

// @ts-ignore
window.htmz = function htmz(frame: HTMLIFrameElement) {
  let location = frame.contentWindow?.location
  if (location == null || location.href === "about:blank") return;

  let doc = frame.contentDocument
  if (doc == null) return
  for (let el of Array.from(doc.body.children).concat(Array.from(doc.head.children))) {
    // before, prepend, append, after
    let swap = el.getAttribute("hz-swap") ?? "replaceWith"
    el.removeAttribute("hz-swap")
    let targetQuery = el.getAttribute("hz-target") || el.id && `#${el.id}`
    el.removeAttribute("hz-target")
    let target = document.querySelector(targetQuery)
    if (!target) continue
    // @ts-ignore
    if (el.tagName === "TEMPLATE") el = el.content.cloneNode(true)
    // @ts-ignore
    target[swap]?.(el)
  }

  frame.remove()
  document.body.appendChild(frame)
  location.replace("about:blank")
}

document.body.insertAdjacentHTML("beforeend", `<iframe hidden name=htmz onload="window.htmz(this)"></iframe>`)

customElements.define("x-theme", class extends HTMLElement {
  constructor() {
    super()
    let theme = this.dataset.theme;
    let docElement = document.documentElement
    theme === "neither" ? docElement.removeAttribute("data-theme") : docElement.setAttribute("data-theme", theme || "")
    this.remove()
  }
})

customElements.define("x-refresh", class extends HTMLElement {
constructor() {
  super()
  setTimeout(() => {
    document.location.reload()
  }, 250)
}
})
