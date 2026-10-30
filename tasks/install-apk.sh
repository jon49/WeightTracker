#!/usr/bin/env bash
# Builds the Android app, installs it on the connected phone (or emulator)
# and opens it. Your data on the phone is kept. With more than one device
# connected, pick one: ANDROID_SERIAL=<serial from android-devices.sh>.
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
make -C "$(dirname "$0")/../native" install-apk
adb shell am start -n com.jnyman.weight/io.v.android.VActivity
