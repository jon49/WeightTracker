export const isSelected =
    <T extends string>(currentValue: string|undefined) =>
    (value: T) => value === currentValue ? "selected" : null

export function cleanHtmlId(s: string) {
  return s.replace(/[\W_-]/g,'-');
}

export function getProperty<T>(obj: any, prop: string) : T | undefined {
  // @ts-ignore
  if (typeof obj === "object" && prop in obj) {
    // @ts-ignore
    return obj[prop]
  }
  return
}

export function jsonResponse(o: any) {
    return new Response(
        JSON.stringify(o),
        { status: 200
        , headers: {
            "Content-Type": "application/json"
        } },
    )
}

export function equals(a: string, b: string) {
  return a.localeCompare(b, void 0, {sensitivity: "base"}) === 0
}

export function sort<T>(array: T[], f: (x: T) => string) {
  return array.sort((a, b) => f(a).localeCompare(f(b), void 0, {sensitivity: "base"}))
}

export function getNewId(ids: number[]) {
    return Math.max(0, ...ids) + 1
}

export function tail<T>(xs: T[]) : T {
    return xs.slice(-1)[0]
}
