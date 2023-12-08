(() => {

const doc = document

doc.addEventListener("submit", async e => {
    e.preventDefault()
    const form = e.target
    let action = form.action
    let response = await fetch(action, {
        method: form.method,
        body: new FormData(form)
    })
    let data
    if (response.headers.get("content-type")?.includes("application/json")) {
        data = await response.json()
    }
    if (!response.ok) {
        if (data?.message) {
            writeMessage(data?.message)
        }
        return
    }

    if (["login", "register", "reset-password"].some(x => action.includes(x))) {
        location.href = "/web/?login=success"
        return
    }

    if (action.includes("forgot-password")) {
        // alert("Password reset link has been sent to your email")
        writeMessage("Send me an email that you requested a password reset")
        return
    }

})

function getHtml(text) {
    const template = doc.createElement("template")
    template.innerHTML = text.trim()
    return template.content
}

function writeMessage(msg) {
    let message = getHtml(`<p class="message">${msg}</p>`)
    doc.querySelector("main").prepend(message)
}

})()

