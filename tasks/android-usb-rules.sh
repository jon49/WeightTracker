#!/usr/bin/env bash
# Lets adb talk to a phone over USB without root. Run it once if
# `tasks/android-devices.sh` shows the phone as "no permissions", then unplug
# the phone and plug it back in.
set -euo pipefail
sudo apt install -y android-sdk-platform-tools-common
