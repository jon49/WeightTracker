import html from "html-template-tag-stream"

function when<T>(condition: T | undefined, fn: ((arg0: T) => any)) : string | number | AsyncGenerator<any, void, unknown> | null
function when(condition: any, s: string) : string | null
function when<T>(condition: any, fn: Generator) : any
function when(condition: any, fn: any) {
    if (!!condition) {
        return typeof fn === "string" || fn.constructor.name === 'GeneratorFunction'
            ? fn
        : fn(condition)
    }
    return null
}

export { when }

export default html

