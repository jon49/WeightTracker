#!/usr/bin/env bash
# Lists the phones and emulators adb can see. "device" means ready;
# "unauthorized" means tap Allow on the phone's "Allow USB debugging?" prompt;
# "no permissions" means run tasks/android-usb-rules.sh.
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
adb devices -l
