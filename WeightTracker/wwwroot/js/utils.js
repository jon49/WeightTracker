// @ts-check

export const getById = (/** @type {string} */ id) => document.getElementById(id)

/**
 * @param {Date} date
 * @param {number} value
 */
export function dateAdd(date, value) {
    date.setDate(date.getDate() + value)
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
    // 1e3*60*60*24 == 86,400,000 ms to days
    const count = ((+to - +from)/864e5 + 1) | 0
    const dates = new Array(count)
    for (let index = 0; index < count; index++) {
        dates[index] = dateToString(from)
        dateAdd(from, 1)
    }
    return dates
}
