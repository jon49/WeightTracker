export const getById = (id: string) => document.getElementById(id)

export function dateAdd(date: Date, value: number, mutate = false) {
    let newDate = mutate ? date : new Date(date)
    newDate.setDate(date.getDate() + value)
    return newDate
}

export function getPreviousDay(date: Date, targetDay: number) {
    date = new Date(date)
    while (date.getDay() !== targetDay) {
        dateAdd(date, -1, true)
    }
    return date
}

export function dateToString(date: Date) {
    return `${date.getFullYear()}-${(date.getMonth()+1+"").padStart(2, "0")}-${(date.getDate()+"").padStart(2, "0")}`
}

export function dateFill(from: Date, to: Date) : string[] {
    from = new Date(from)
    // 1e3*60*60*24 == 86,400,000 ms to days
    const count = Math.ceil((+to - +from)/864e5 + 1)
    const dates = new Array(count)
    for (let index = 0; index < count; index++) {
        dates[index] = dateToString(from)
        dateAdd(from, 1, true)
    }
    return dates
}

export function round(number: number, precision: number) {
    let p = Math.pow(10, precision)
    return Math.round(number * p) / p
}

export function reduceSlice<T, S>(data: T[], step: number, f: (acc: S, val: T, index: number) => S, init: () => S): S[] {
    const length = data.length
    const arr = new Array(Math.ceil(length/step))
    for (let index = 0; index < length; index += step) {
        let acc = init instanceof Function ? init() : init
        for (let i = index; i < step + index && i < length; i++) {
            acc = f(acc, data[i], i)
        }
        arr[(index/step)] = acc
    }
    return arr
}

export function avg(numbers: number[] | undefined): number {
    let filtered = numbers?.filter(x => x)
    return <any>numbers?.length > 0
        ? (<number[]><any>filtered)
          .reduce((acc, x) => acc + x, 0) / (<number[]><any>filtered).length
    : 0
}

export function stdev(numbers: number[] | undefined) : number {
    if (!numbers) return 0
    let average = avg(numbers)
    return Math.sqrt(avg(numbers.map(x => Math.pow(average - x, 2))))
}

export function formatNumber(number: number | undefined, precision?: number) : string | undefined {
    if (!number || Number.isNaN(number)) return
    if (precision === undefined || precision === null) return ""+number
    let multiplier = Math.pow(10, precision)
    return (Math.round(number * multiplier) / multiplier).toFixed(precision)
}

export function setDefaults<T>(o: T|undefined, defaults: [keyof T, T[keyof T]][]) {
    if (!o) {
        o = <T>{}
    }
    for (const [key, value] of defaults) {
        if (!o[key]) {
            o[key] = value
        }
    }
    return o
}

export const isSelected =
    <T extends string>(currentValue: string|undefined) =>
    (value: T) => value === currentValue ? "selected" : null

// export function getFormData<T>(formData: FormData) : Record<keyof T, string> {
//     let o : any = {}
//     for (let [key, value] of formData.entries()) {
//         if (typeof value === "string") {
//             o[key] = value
//         }
//     }
//     return <any>o
// }

export function toNumber(s: unknown) {
    // @ts-ignore
    return !isNaN(s) ? +s : undefined
}
