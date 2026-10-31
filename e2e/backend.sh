#!/usr/bin/env bash
# Throwaway TrailBase for the E2E suite. Every run starts from an empty depot
# seeded from ../ImageBase (config, migrations, freshly built guest wasm), so
# tests never read or write real dev data. As ../soccer/e2e/backend.sh.
set -euo pipefail

cd "$(dirname "$0")"
IMAGEBASE="${IMAGEBASE:-../../ImageBase}"
DEPOT="$PWD/.depot"
PORT="${E2E_API_PORT:-4011}"

make -C "$IMAGEBASE" deploy >/dev/null

rm -rf "$DEPOT"
mkdir -p "$DEPOT/wasm" "$DEPOT/uploads"
cp "$IMAGEBASE/traildepot/config.textproto" "$DEPOT/"
cp -r "$IMAGEBASE/traildepot/migrations" "$DEPOT/"
cp "$IMAGEBASE/traildepot/wasm/imagebase_guest.wasm" "$DEPOT/wasm/"

exec trail --depot="$DEPOT" run --address="localhost:$PORT" --dev \
  --runtime-root-fs="$DEPOT/uploads"
