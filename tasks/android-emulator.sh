#!/usr/bin/env bash
# Starts the test emulator (set up by `tasks/android-setup.sh --emulator`).
# It needs about 4 GB of free memory. swangle_indirect gives the OpenGL ES 3.1
# the app needs; the default software GPU only has 3.0.
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
exec emulator -avd weight-test -gpu swangle_indirect -memory 4096 -cores 4 -no-audio "$@"
