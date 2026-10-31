#!/usr/bin/env bash
# Runs the native client's tests against a real, throwaway TrailBase: the
# account calls in native/core/server_test.v (deleting an account). The
# server's depot is seeded from ../ImageBase and deleted afterwards, so no
# real data is read or written. Needs trail and sqlite3 on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGEBASE="${IMAGEBASE:-$ROOT/../ImageBase}"
PORT="${WEIGHT_TEST_PORT:-4013}"
DEPOT="$(mktemp -d)"

make -C "$IMAGEBASE" deploy >/dev/null
mkdir -p "$DEPOT/wasm" "$DEPOT/uploads"
cp "$IMAGEBASE/traildepot/config.textproto" "$DEPOT/"
cp -r "$IMAGEBASE/traildepot/migrations" "$DEPOT/"
cp "$IMAGEBASE/traildepot/wasm/imagebase_guest.wasm" "$DEPOT/wasm/"

trail --depot="$DEPOT" run --address="localhost:$PORT" --dev \
  --runtime-root-fs="$DEPOT/uploads" >"$DEPOT/trail.log" 2>&1 &
TRAIL=$!
trap 'kill $TRAIL 2>/dev/null; wait $TRAIL 2>/dev/null; rm -rf "$DEPOT"' EXIT

for _ in $(seq 50); do
  curl -s -o /dev/null "http://localhost:$PORT/api/healthcheck" && break
  sleep 0.2
done

cd "$ROOT/native"
WEIGHT_TEST_SERVER="http://localhost:$PORT" WEIGHT_TEST_DB="$DEPOT/data/main.db" \
  "${V:-v}" -stats test core
