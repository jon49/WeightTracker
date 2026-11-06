#!/usr/bin/env bash
# Removes the desktop app that desktop-install.sh put in place: ~/.local/bin/weight,
# its launcher and its icon. The app's data in ~/.local/share/weight stays; delete
# that folder too to start fresh (anything not yet synced is lost).
set -euo pipefail
make -C "$(dirname "$0")/../native" uninstall
