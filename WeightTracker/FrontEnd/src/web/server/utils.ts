export const isSelected =
    <T extends string>(currentValue: string|undefined) =>
    (value: T) => value === currentValue ? "selected" : null

const searchParamsHandler = {
  get(obj: any, prop: string) {
    if (prop === "_url") {
      return obj
    }
    return obj.searchParams.get(prop)
  }
}

export function searchParams<TReturn>(req: Request) : TReturn & {_url: URL} {
  let url = new URL(req.url)
  return new Proxy(url, searchParamsHandler)
}

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

export const reject = (s: string | string[]) : Promise<any> =>
        typeof(s) === "string"
            ? Promise.reject([s])
        : Promise.reject(s)

export function jsonResponse(o: any) {
    return new Response(
        JSON.stringify(o),
        { status: 200
        , headers: {
            "Content-Type": "application/json"
        } },
    )
}

export function redirect(req: Request) {
  return Response.redirect(req.referrer, 302)
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
