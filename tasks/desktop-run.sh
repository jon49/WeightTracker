#!/usr/bin/env bash
# Builds the desktop app and opens it. Options go to the app, e.g.
#   tasks/desktop-run.sh --size 400x820        # phone-sized window
#   tasks/desktop-run.sh --screen charts
set -euo pipefail
native="$(dirname "$0")/../native"
make -C "$native" build
exec "$native/weight" "$@"
