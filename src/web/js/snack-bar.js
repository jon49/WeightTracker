// @ts-check

(function() {
    // See https://www.w3schools.com/howto/howto_js_snackbar.asp
    if (!document.getElementById("snack-bar-css")) {
        const $style = document.createElement("style")
        $style.setAttribute("id", "snack-bar-css")
        $style.innerHTML = `
        root {
            --snack-bar-duration: 3s;
        }
        .snack-bar {
            background-color: rgba(0, 0, 0, 0.25);
            padding: 1em;
            max-width: 600px;
            margin: auto;
            border-radius: 10px;
            animation: fadeInOut var(--snack-bar-duration)s linear 1 forwards;
        }
        @keyframes fadeInOut {
            0%,100% { opacity: 0; }
            25%,50% { opacity: 1; }
        }`
        document.head.append($style)
    }

    /**
     * @param {HTMLElement} el 
     * @returns number
     */
    function getSnackBarDuration(el) {
        return +getComputedStyle(el).getPropertyValue('--snack-bar-duration')
    }

    // Also known as "Toast" and "Snackbar"
    customElements.define("snack-bar", 
        class Snackbar extends HTMLElement {
            connectedCallback() {
                const timeout = (getSnackBarDuration(this) || getSnackBarDuration(document.documentElement) || 3) + 0.1
                setTimeout(() => {
                    this.remove()
                } , timeout * 1e3)
            }
        }
    )

})()
