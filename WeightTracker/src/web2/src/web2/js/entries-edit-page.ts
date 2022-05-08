
document
.getElementById("date-change")
?.addEventListener("change", e => {
    let el = <HTMLInputElement>e.target
    if (el.value?.length !== 10) return
    document.getElementById("date-go")?.click()
})
