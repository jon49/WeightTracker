import { notifier } from "@jon49/sw/new-app-notifier.js"

notifier(notifyUserAboutNewVersion)

function notifyUserAboutNewVersion(state = "", worker: ServiceWorker) {
    let nav = document.getElementById("sw-message")
    nav?.insertAdjacentHTML("afterbegin", `<div class=inline><a id=new-worker href="#">Click here to update your app.</a></div>`)
    let newWorkerLink = document.getElementById("new-worker")
    function handleUpdateClick(e: Event) {
        e.preventDefault()
        worker.postMessage({ action: 'skipWaiting' })
        newWorkerLink?.remove()
    }
    newWorkerLink?.addEventListener("click", handleUpdateClick)
    if (state === "waiting") return
    // Publish custom event for "user-messages" to display a toast.
    document.dispatchEvent(new CustomEvent("user-messages", {
        detail: ["A new version of the app is available. Click the link in the top right to update."]
    }))
}

