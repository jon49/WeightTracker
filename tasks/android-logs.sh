#!/usr/bin/env bash
# Follows the app's log on the connected phone (or emulator): its messages,
# sokol's, and crash reports. Ctrl+C to stop.
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
adb logcat -s weight:* V:* DEBUG:* AndroidRuntime:*
