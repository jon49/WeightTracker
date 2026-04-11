import { useRoutes } from "@jon49/sw/routes.middleware.js";
import { useResponse } from "@jon49/sw/response.middleware.js";
import { swFramework } from "@jon49/sw/web-framework.js";
import html from "html-template-tag-stream";
import { loginView, syncCountView } from "./pages/_layout.html.js";
import globalDB from "./server/global-model.js";

let version: string = self.sw.version;
const isDev = self.location.hostname === "localhost";

if (isDev) {
  let lastSwContent = "";
  swFramework.use(async function devMode(req, res): Promise<void | false> {
    // Refresh file-map links from network
    try {
      let swRes = await fetch("/web/sw.js");
      let swContent = await swRes.text();
      if (swContent !== lastSwContent) {
        lastSwContent = swContent;
        let match = swContent.match(/importScripts\("([^"]+)"/);
        if (match) {
          let mapRes = await fetch(match[1]);
          let mapContent = await mapRes.text();
          let linksMatch = mapContent.match(/links: (\[.*\])/);
          if (linksMatch) {
            let newLinks = JSON.parse(linksMatch[1]);
            // Mutate in-place so the reference in routes.middleware stays current
            let links = (self.sw as any).links;
            links.length = 0;
            links.push(...newLinks);
          }
        }
      }
    } catch {}

    // Serve static files directly from network using resolved hashed URL
    // (bypasses cacheResponse which incorrectly fetches the unhashed URL)
    let url = new URL(req.url);
    let p = url.pathname;
    if (p.startsWith("/web/") && p.lastIndexOf("/") < p.lastIndexOf(".")) {
      let links = (self.sw as any).links;
      let hashed = links?.find((x: any) => x.url === p)?.file || p;
      res.response = await fetch(hashed);
      return false;
    }
  });
}

swFramework.use(useRoutes);
swFramework.use(async function useHtmz(req, res, ctx): Promise<void> {
  if (req.method !== "POST") return;

  let updated = await globalDB.updated();

  let messages = (ctx.messages || []) as string[];

  if (res.error) {
    messages.push(res.error);
  }

  res.body = html`${res.body}
<div id=toasts>
    ${messages.map((x) => html`<dialog class=toast _load=toast open><p class=message>${x}</p></dialog>`)}
</div>
${res.status === 401 ? html`${loginView()}` : null}
${syncCountView(updated.length)}
`;
});
swFramework.use(useResponse);

self.addEventListener("install", (e: Event) =>
  // @ts-ignore
  e.waitUntil(
    isDev
      // @ts-ignore
      ? self.skipWaiting()
      : caches
          .open(version)
          .then((cache) =>
            // @ts-ignore
            cache.addAll(self.sw.links.map((x) => x.file)),
          )
          .catch((e) => console.error(e)),
  ),
);

// @ts-ignore
self.addEventListener("fetch", (e: FetchEvent) => e.respondWith(swFramework.start(e)))

// @ts-ignore
self.addEventListener("activate", async (e: ExtendableEvent) => {
  console.log("Service worker activated.");

  if (isDev) {
    let keys = await caches.keys();
    e.waitUntil(
      Promise.all([
        ...keys.map((key) => caches.delete(key)),
        // @ts-ignore
        self.clients.claim(),
      ]),
    );
    return;
  }

  let keys = await caches.keys(),
    deleteMe = keys.map((x: string) => version !== x && caches.delete(x)).filter((x) => x);
  if (deleteMe.length === 0) return;
  e.waitUntil(Promise.all(deleteMe));
});

self.addEventListener("message", (event) => {
  if (event.data.action === "skipWaiting") {
    // @ts-ignore
    return self.skipWaiting();
  }
});
