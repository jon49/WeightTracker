#!/usr/bin/env bash
# One-time setup for building the desktop app on Linux: the X11, OpenGL and
# EGL headers.
set -euo pipefail
sudo apt install -y libx11-dev libxi-dev libxcursor-dev libxrandr-dev libgl-dev libegl-dev
