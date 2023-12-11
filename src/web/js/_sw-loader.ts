import { notifier } from "@jon49/sw/new-app-notifier.js"

notifier(notifyUserAboutNewVersion)

let worker : ServiceWorker | undefined
function notifyUserAboutNewVersion(state = "", worker_: ServiceWorker) {
    worker = worker_
    let nav = document.getElementById("sw-message")
    nav?.insertAdjacentHTML("afterbegin", `<div class=inline><a id=new-worker href="#">Click here to update your app.</a></div>`)
    let newWorkerLink = document.getElementById("new-worker")
    newWorkerLink?.addEventListener("click", handleUpdateClick)
    if (state === "waiting") return
    // Publish custom event for "user-messages" to display a toast.
    document.dispatchEvent(new CustomEvent("user-messages", {
        detail: {
            html: `A new version of the app is available. Click the link at the top of the page to update. <a data-action=update-service-worker style="color:blue;" href='#'>Or click here.</a>`,
        }
    }))
    let item = document.querySelector("[data-action='update-service-worker']")
    if (!item) return
    item.addEventListener("click", handleUpdateClick)
}

function handleUpdateClick(e: Event) {
    e.preventDefault()
    worker?.postMessage({ action: 'skipWaiting' })
}

