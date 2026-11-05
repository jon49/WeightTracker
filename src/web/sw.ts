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

  let updatedCount = await globalDB.updatedCount();

  let messages = (ctx.messages || []) as string[];

  if (res.error) {
    messages.push(res.error);
  }

  res.body = html`${res.body}
<div id=toasts>
    ${messages.map((x) => html`<dialog class=toast _load=toast open><p class=message>${x}</p></dialog>`)}
</div>
${res.status === 401 ? html`${loginView()}` : null}
${syncCountView(updatedCount)}
`;
});
swFramework.use(useResponse);

self.addEventListener("install", (e: Event) =>
  // @ts-ignore
  e.waitUntil(
    isDev
      ? // @ts-ignore
        self.skipWaiting()
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
self.addEventListener("fetch", (e: FetchEvent) => e.respondWith(swFramework.start(e)));

// waitUntil must be called before the handler first awaits, or it throws.
// @ts-ignore
self.addEventListener("activate", (e: ExtendableEvent) => {
  console.log("Service worker activated.");
  e.waitUntil(
    (async () => {
      let keys = await caches.keys();
      if (isDev) {
        await Promise.all([
          ...keys.map((key) => caches.delete(key)),
          // @ts-ignore
          self.clients.claim(),
        ]);
        return;
      }
      await Promise.all(keys.filter((x) => x !== version).map((x) => caches.delete(x)));
      await pruneCache();
    })(),
  );
});

// Drops cached files the current file map doesn't list: earlier releases'
// hashed files. The cache is named for `version`, which only changes when it
// is bumped by hand, so without this a release that didn't bump it added its
// files to the ones before.
async function pruneCache() {
  let links: { file: string }[] = (self.sw as any).links;
  let keep = new Set(links.map((x) => x.file));
  let cache = await caches.open(version);
  let stale = (await cache.keys()).filter((x) => !keep.has(new URL(x.url).pathname));
  await Promise.all(stale.map((x) => cache.delete(x)));
  if (stale.length) console.log(`Removed ${stale.length} old cached files.`);
}

self.addEventListener("message", (event) => {
  if (event.data.action === "skipWaiting") {
    // @ts-ignore
    return self.skipWaiting();
  }
});
