#!/usr/bin/env bash
# Runs the web app's unit tests, then its end-to-end tests (e2e/) in Chromium
# against a throwaway TrailBase. Needs trail and sqlite3 on PATH; the first
# run may build ../ImageBase's guest wasm. Pass Playwright options through,
# e.g. tasks/test-e2e.sh -g "deleting".
set -euo pipefail
cd "$(dirname "$0")/.."
npm run test:unit
npx playwright test "$@"
