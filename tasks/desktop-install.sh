#!/usr/bin/env bash
# Builds the desktop app and installs it for you: ~/.local/bin/weight, plus
# a launcher in the applications menu and its icon.
set -euo pipefail
make -C "$(dirname "$0")/../native" install
