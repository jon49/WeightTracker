export const getById = (id: string) => document.getElementById(id)

export function getFormData(f: HTMLFormElement) : any {
    const raw : {[key: string]: string} = {}
    for (let input of new FormData(f)) {
        const key : string = input[0]
        const value = input[1]
        if (typeof value !== "string") continue
        raw[key] = value
    }
    return raw
}

export function fillForm(f: HTMLFormElement, data: { [x: string]: any }) {
    if (!(f instanceof HTMLFormElement) || !data) return
    for (const key of Object.keys(data)) {
        if (f[key]) {
            f[key].value = data[key]
        }
    }
}
