import { reject } from "./utils"

interface Value<T> {
    value: T
}
interface String_ extends Value<string> {
}
export interface String100 extends String_ {}
export interface String50 extends String_ {}
export type TableType = string
export interface IDType<T extends TableType> extends Value<number> { 
    _id: T
}

const notFalsey = async (error: string, val: string | undefined) : Promise<string> =>
    !val ? reject(error) : val

const maxLength = async (error: string, val: string, maxLength: number) =>
    (val.length > maxLength)
        ? reject(error)
    : val

const createString = async (name: string, maxLength_: number, val?: string | undefined) => {
    const trimmed = await notFalsey(`"${name}" is required.`, val?.trim())
    const s = await maxLength(`'${name}' must be less than ${maxLength_} characters.`, trimmed, maxLength_)
    return s
}

function isInteger(val: number) {
    try {
        BigInt(val)
        return true
    } catch(e) {
        return false
    }
}

export async function createNumber(name: string, val: number | string) : Promise<number> {
    let num = +val
    if (isNaN(num)) {
        return reject(`'${name}' was expecting a number but was given ${val}`)
    }
    return num
}

export function createPositiveWholeNumber(name: string) : (val: number | string) => Promise<number> {
    return async (val: number | string) => {
        let num = await createNumber(name, val)
        if (num < 0) return reject(`'${name}' must be 0 or greater. But was given '${val}'.`)
        if (!isInteger(num)) return reject(`${name} must be a whole number. But was given '${num}' and was expecting '${num|0}'.`)
        return num
    }
}

export function createIdNumber(name: string) : (val: number | string) => Promise<number> {
    return async (val: number | string) => {
        let wholeNumber = await createPositiveWholeNumber(name)(val)
        if (wholeNumber < 1) return reject(`'${name}' must be 1 or greater. But was given '${val}'.`)
        return wholeNumber
    }
}

export const maybe =
    <T>(f: (val: T | undefined) => Promise<T>) =>
    (val: T | undefined) =>
        !val ? Promise.resolve(val) : f(val)

export const createString25 =
    (name: string) =>
    (val: string | undefined) =>
        createString(name, 25, val)

export const createString50 =
    (name: string) =>
    (val: string | undefined) =>
        createString(name, 50, val)

export const createDateString =
    (name: string) =>
    async (val: string | undefined) => {
        const trimmed = await notFalsey(`"${name}" is required.`, val?.trim())
        if (/\d{4}-\d{2}-\d{2}/.test(trimmed)) {
            return trimmed
        }
        return reject(`"${name}" is not a valid date string "${val}".`)
    }

export function createCheckbox(val: string | undefined) {
    return Promise.resolve(val === "on")
}

type Nullable<T> = T | undefined | null
export async function required<T>(o: Nullable<T>, message: string): Promise<T> {
    if (!o) return reject(message)
    return o
}

class Assert {
    isFalse(value: boolean, message: string) {
        return !value ? Promise.resolve() : reject(message)
    }
    isTrue(value: boolean, message: string) {
        return this.isFalse(!value, message)
    }
}
export const assert = new Assert()

export async function requiredAsync<T>(oTask: Promise<Nullable<T>>, message?: string) {
    let [result] = await validate([required(await oTask, message ?? "Oops! Something happened which shouldn't have! (requiredAsync)")])
    return result
}

export async function validate<T extends readonly unknown[] | readonly [unknown]>(promises: T):
    Promise<{ -readonly [P in keyof T]: T[P] extends PromiseLike<infer U> ? U : T[P] }> {
    // @ts-ignore
    const result = await Promise.allSettled(<any[]><unknown>promises)
    const failed: string[] = []
    for (const item of result) {
        if (item.status === "rejected") failed.push(item.reason)
    }
    if (failed.length > 0) return reject(failed)
    return <any>result.map(x => {
        if (x.status === "fulfilled") {
            return x.value
        }
        throw new Error("All items should already be resolved")
    })
}

type Unwrap<T> =
	T extends Promise<infer U> ? U :
	T extends (...args: any) => Promise<infer U> ? U :
	T extends (...args: any) => infer U ? U :
	T

export async function validateObject<T extends { [Key in keyof T]: (value: any | undefined) => Promise<any> }>(original: any, validator: T) {
    let validatorKeys = Object.keys(validator)
    let validations = new Array(validatorKeys.length)
    let i = 0
    for (let validatorKey of validatorKeys) {
        // @ts-ignore
        validations[i++] = validator[validatorKey](original[validatorKey])
    }
    let xs = await validate(validations)
    i = 0
    let o = <any>{}
    for (let validatorKey of validatorKeys) {
        o[validatorKey] = xs[i++]
    }
    return <{ [Key in keyof T]: Unwrap<T[Key]> }>o
}
