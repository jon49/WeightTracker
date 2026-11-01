#!/usr/bin/env bash
# Local-testing harness for the weight tracker against the TrailBase backend.
#
# Production runs the static files behind NGINX with TrailBase upstream — this
# script reproduces that topology locally:
#
#   1. Build the static bundle into ./server/public via the @jon49/sw tooling.
#   2. Start TrailBase from ../ImageBase on :4000 (background).
#   3. Run a tiny Node reverse proxy on :8008 that serves ./server/public for
#      normal paths and forwards /api/* to TrailBase.
#
# Usage:  ./server/start.sh [--rebuild]
#
#   --rebuild    Wipe and rebuild ./server/public before starting.
#
# Stop with Ctrl-C; both background processes are terminated via trap.
#
# Hashed asset names: the static HTML (the auth pages, outside the service
# worker) gets hashed names written in by the build, and pages inside the
# service worker have their unhashed names rewritten by it. So the static
# server, like NGINX in production, needs no rewrite of its own. A URL inside
# a CSS or JS file (@import, url()) isn't rewritten outside the service
# worker, so every page links base.css itself, before app.css.

set -euo pipefail

current_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
repo_root="$(cd -- "$current_dir/.." &> /dev/null && pwd)"
imagebase_dir="$(cd -- "$repo_root/../ImageBase" &> /dev/null && pwd)"

public_dir="$current_dir/public"
proxy_port=8008
trail_port=4000

if [[ "${1:-}" == "--rebuild" || ! -d "$public_dir" ]]; then
    echo "Building static bundle into $public_dir ..."
    (cd "$repo_root" && npx tsx ./node_modules/@jon49/sw/bin/start.ts \
        --env=prod --target="$public_dir")
fi

cleanup() {
    [[ -n "${trail_pid:-}" ]] && kill "$trail_pid" 2>/dev/null || true
    [[ -n "${proxy_pid:-}" ]] && kill "$proxy_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting TrailBase on :$trail_port (from $imagebase_dir) ..."
(cd "$imagebase_dir" && make dev) &
trail_pid=$!

echo "Starting static + reverse proxy on :$proxy_port ..."
node - <<EOF &
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = ${public_dir@Q};
const upstream = { host: "127.0.0.1", port: ${trail_port} };

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function proxy(req, res) {
  const r = http.request(
    { host: upstream.host, port: upstream.port, method: req.method, path: req.url, headers: req.headers },
    up => { res.writeHead(up.statusCode || 502, up.headers); up.pipe(res); }
  );
  r.on("error", err => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Bad gateway: " + err.message);
  });
  req.pipe(r);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath.includes("..")) { res.writeHead(400); return res.end("bad path"); }
  let filePath = path.join(root, urlPath);
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, "index.html");
    fs.readFile(filePath, (err2, buf) => {
      if (err2) {
        let fallback = path.join(root, urlPath.replace(/\/[^/]*$/, ""), "index.html");
        return fs.readFile(fallback, (err3, fbuf) => {
          if (err3) { res.writeHead(404); return res.end("not found"); }
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(fbuf);
        });
      }
      let type = mime[path.extname(filePath)] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(buf);
    });
  });
}

http.createServer((req, res) => {
  if ((req.url || "").startsWith("/api/")) return proxy(req, res);
  serveStatic(req, res);
}).listen(${proxy_port}, "localhost", () => {
  console.log("Proxy listening on http://localhost:${proxy_port} -> TrailBase :${trail_port}");
});
EOF
proxy_pid=$!

wait
