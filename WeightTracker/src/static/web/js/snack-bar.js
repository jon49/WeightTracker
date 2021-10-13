// @ts-check

(function() {
    // See https://www.w3schools.com/howto/howto_js_snackbar.asp

    // Also known as "Toast" and "Snackbar"
    class Snackbar extends HTMLElement {
        constructor() {
            super()
            const shadowRoot = this.attachShadow({mode: 'open'})
            shadowRoot.innerHTML = `<slot name="message"><p>I love cheeseburgers!</p></slot>`
        }

        connectedCallback() {
            this.classList.add("snack-bar-style")
            let temp =
                setTimeout(() => {
                    clearTimeout(temp)
                    this.remove()
                } , 3.5e3)
        }
    }

    customElements.define("snack-bar", Snackbar)
})()