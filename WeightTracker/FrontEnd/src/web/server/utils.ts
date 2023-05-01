export const isSelected =
    <T extends string>(currentValue: string|undefined) =>
    (value: T) => value === currentValue ? "selected" : null

export const reject = (s: string | string[]) : Promise<any> =>
        typeof(s) === "string"
            ? Promise.reject([s])
        : Promise.reject(s)
