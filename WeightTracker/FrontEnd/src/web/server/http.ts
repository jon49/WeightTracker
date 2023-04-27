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
  if (req.headers.get("HF-Request")) {
    let res = new Response(null, {
      status: 205,
      headers: {
        location: req.referrer,
      },
    })
    return res
  }
  return Response.redirect(req.referrer, 303)
}

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

