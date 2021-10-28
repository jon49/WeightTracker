/// <reference types="../node_modules/@types/global" />
// @ts-check

export const getById = (/** @type {string} */ id) => document.getElementById(id)

/**
 * @param {Date} date
 * @param {number} value
 */
export function dateAdd(date, value, mutate = false) {
    let newDate = mutate ? date : new Date(date)
    newDate.setDate(date.getDate() + value)
    return newDate
}

/**
 * @param {Date} date
 * @param {number} targetDay
 */
export function getPreviousDay(date, targetDay) {
    date = new Date(date)
    while (date.getDay() !== targetDay) {
        dateAdd(date, -1, true)
    }
    return date
}

/**
 * @param {Date} date
 */
export function dateToString(date) {
    return `${date.getFullYear()}-${(date.getMonth()+1+"").padStart(2, "0")}-${(date.getDate()+"").padStart(2, "0")}`
}

/**
 * @param {Date} from
 * @param {Date} to
 * @returns {string[]}
 */
export function dateFill(from, to) {
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

/** @type {Form.getFormData} */
export function getFormData(f) {
    /** @type {{[key: string]: string}} */
    const raw = {}
    for (let input of new FormData(f)) {
        /** @type {string} */
        const key = input[0]
        const value = input[1]
        if (typeof value !== "string") continue
        raw[key] = value
    }
    return raw
}

/**
 * @param {HTMLFormElement} f
 * @param {{ [x: string]: any; }} data
 */
export function fillForm(f, data) {
    if (!(f instanceof HTMLFormElement) || !data) return
    for (const key of Object.keys(data)) {
        if (f[key]) {
            f[key].value = data[key]
        }
    }
}

/**
 * @param {number} number
 * @param {number} precision
 */
export function round(number, precision) {
    let p = Math.pow(10, precision)
    return Math.round(number * p) / p
}

/**
 * @template T, S
 * @param {T[]} data
 * @param {number} step
 * @param {(acc: S, val: T, index: number) => S} f
 * @param {() => S} init
 * @returns {S[]}
 */
export function reduceSlice(data, step, f, init) {
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

/**
 * @param {number[] | undefined} numbers
 * @returns {number}
 */
export function avg(numbers) {
    let filtered = numbers.filter(x => x)
    return numbers?.length > 0
        ? filtered
          .reduce((acc, x) => acc + x, 0) / filtered.length
    : 0
}

/**
 * @param {number[] | undefined} numbers 
 * @returns {number}
 */
export function stdev(numbers) {
    if (!numbers) return 0
    let average = avg(numbers)
    return Math.sqrt(avg(numbers.map(x => Math.pow(average - x, 2))))
}

/**
 * @param {number} number
 * @param {number} [precision]
 * @returns {string}
 */
export function formatNumber(number, precision) {
    if (!number || Number.isNaN(number)) return
    if (precision === undefined || precision === null) return ""+number
    let multiplier = Math.pow(10, precision)
    return (Math.round(number * multiplier) / multiplier).toFixed(precision)
}

/**
 * @template T
 * @param {T} o 
 * @param {[keyof T, T[keyof T]][]} defaults 
 * @returns T
 */
export function setDefaults(o, defaults) {
    if (!o) {
        // @ts-ignore
        o = {}
    }
    for (const [key, value] of defaults) {
        if (!o[key]) {
            o[key] = value
        }
    }
    return o
}

/**
 * @param {string} s
 */
export function toHTML(s) {
    let el = document.createElement("x")
    el.innerHTML = s
    return el.firstElementChild
}
