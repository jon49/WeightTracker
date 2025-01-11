import "html-form"
import "form-subscribe"
import "./_sw-loader.js"
import "@jon49/web/x-dialog.js"
import "@jon49/web/x-toaster.js"

const doc = document

if (doc.location.search.includes("login=success")) {
    doc.location.href = "/web/"
}

// @ts-ignore
doc.addEventListener("user-messages", (e: CustomEvent) => {
    let template = doc.getElementById("toast-template")
    let toasts = doc.getElementById("toasts")
    if (!(template && template instanceof HTMLTemplateElement) || !toasts) return
    if (Array.isArray(e.detail)) {
        for (let message of e.detail) {
            appendMessage(template, toasts, message)
        }
    }
    if (e.detail.html) {
        appendMessage(template, toasts, e.detail.html, true)
    }
})

function appendMessage(
    template: HTMLTemplateElement,
    toasts: HTMLElement,
    message: string,
    isHtml = false
) {
    let clone = template.content.cloneNode(true)
    let wordCount = message.split(" ").length
    if (!(clone instanceof DocumentFragment)) return
    let first = clone.firstElementChild
    if (!first) return
    first.setAttribute("data-timeout", "" + (1e3 + wordCount * 400))
    let messageEl = first.querySelector(".message")
    if (!messageEl) return
    if (isHtml) {
        messageEl.innerHTML = message
    } else {
        messageEl.textContent = message
    }
    toasts.appendChild(first)
}

// @ts-ignore
doc.addEventListener("app-theme", (e: CustomEvent) => {
    let theme = e.detail.theme;
    let docElement = doc.documentElement
    theme === "neither" ? docElement.removeAttribute("data-theme") : docElement.setAttribute("data-theme", theme)
})

