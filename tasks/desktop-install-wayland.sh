#!/usr/bin/env bash
# Builds the desktop app for Wayland itself, rather than X11 through XWayland,
# and installs it as desktop-install.sh does. Run desktop-setup-wayland.sh
# once first.
set -euo pipefail
make -C "$(dirname "$0")/../native" install VFLAGS='-d sokol_wayland'
