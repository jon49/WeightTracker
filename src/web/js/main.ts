(() => {

    function createMessage(message: string, duration: number | null = null) {
        const messages = document.getElementById('messages')
        if (!messages) return
        const snackBar = document.createElement("snack-bar")
        snackBar.innerHTML = `<div class=snack-bar>${message}</div>`
        if (duration != null) {
            snackBar.style.setProperty("--snack-bar-duration", `${duration}`)
        }
        messages.appendChild(snackBar)
    }

    // https://deanhume.com/displaying-a-new-version-available-progressive-web-app/
    function shouldUpdateServiceWorker(this: ServiceWorker) {
        if (this.state === 'installed' && navigator.serviceWorker.controller) {
            console.log("State installed, initiate ask user.")
            createMessage(
                `<p>A new version the app has been loaded.
                    <button data-action=refresh-service-worker>Refresh</button>
                </p>`,
                20)
            listenToUserResponse(this)
            return true
        } else if (this.state === "activated") {
            document.location.reload()
            return true
        }
        console.log(`State incorrect "${this.state}" or controller not valid ${navigator.serviceWorker.controller}`)
        return false
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
        .register('/web/sw.js')
        .then(reg => {
            reg.addEventListener('updatefound', () => {
                console.log("Update found.")
                let newWorker = reg.waiting || reg.installing
                if (!newWorker) return
                console.log("Initiate user input to update service worker.")
                if (!shouldUpdateServiceWorker.bind(newWorker)()) {
                    newWorker.addEventListener('statechange', shouldUpdateServiceWorker)
                }
            })
        })
    }

    function reload() {
        let refreshing = false
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            console.log("Controller change.")
            if (refreshing) return
            refreshing = true
            console.log("Reload.")
            window.location.reload()
        })
    }

    function listenToUserResponse(newWorker: ServiceWorker) {
        document.addEventListener('click', e => {
            console.log("Initiate skip waiting.")
            const target = e.target
            if (!(target instanceof HTMLButtonElement) || target.dataset.action !== "refresh-service-worker") return
            const toaster = target.closest("snack-bar")
            if (toaster instanceof HTMLElement) toaster.remove()
            reload()
            console.log("Call skip waiting.")
            newWorker.postMessage({ action: 'skipWaiting' })
        })
    }

    // Progressively enhance the page. https://github.com/jon49/mpa-enhancer
    let doc = document,
        w = window,
        query = doc.querySelector.bind(doc)

    function getCleanUrlPath() {
        let url = new URL(doc.location.href)
        return url.pathname.replace(/\/$/, "")
    }

    w.addEventListener('beforeunload', () => {
        let active = doc.activeElement
        localStorage.pageLocation = JSON.stringify({
            href: getCleanUrlPath(),
            y: w.scrollY,
            height: doc.body.scrollHeight,
            active: {
                id: active?.id,
                name: active?.getAttribute('name')
            }
        })
    })

    function load() {
        if (query('[autofocus]')) return
        let location = localStorage.pageLocation
        if (!location) return
        let { y, height, href, active: { id, name } } = JSON.parse(location)
        let target = doc.body.dataset.mpaScrollTo
        if (href === getCleanUrlPath() && (target || y)) {
            if (target) {
                let el = query(target)
                el?.scrollIntoView()
            } else {
                w.scrollTo({ top: y + doc.body.scrollHeight - height })
            }
        }
        let active =
            doc.getElementById(id)
            || query(`[name="${name}"]`)
        run('focus', active)
        run('select', active)
    }

    /**
    * @param {string} method
    * @param {HTMLElement} el
    * */
    function run(method, el) {
        el[method] && el[method]()
    }

    load()

    // @ts-ignore
    self.app = self.app || {}
    // @ts-ignore
    self.app.createMessage = createMessage

})()
