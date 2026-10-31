#!/usr/bin/env bash
# One-time setup for a native Wayland build of the desktop app (see
# desktop-install-wayland.sh): the Wayland, xkbcommon and EGL headers. The
# default build (desktop-setup.sh) uses X11, which also runs under XWayland.
set -euo pipefail
sudo apt install -y libwayland-dev libxkbcommon-dev libegl-dev wayland-protocols
