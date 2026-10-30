#!/usr/bin/env bash
# One-time setup for building the Android app: Java, the Android SDK
# (platform 34, build-tools 34, NDK r27) in ~/Android/Sdk, and vab, V's
# Android build tool. Running it again only fills in what is missing.
#   tasks/android-setup.sh             # what `make-apk.sh` needs
#   tasks/android-setup.sh --emulator  # plus an emulator (a Pixel 6, Android 14)
# Installing the SDK packages accepts Google's Android SDK license.
set -euo pipefail
source "$(dirname "$0")/android-env.sh"

if ! command -v javac >/dev/null || ! command -v unzip >/dev/null; then
  sudo apt install -y openjdk-17-jdk-headless unzip
fi

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  tmp=$(mktemp -d)
  wget -q https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip -O "$tmp/tools.zip"
  unzip -q "$tmp/tools.zip" -d "$tmp"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$tmp"
fi

# `yes` dies of SIGPIPE when sdkmanager is done, which pipefail would count.
(yes || true) | sdkmanager --sdk_root="$ANDROID_HOME" --licenses >/dev/null
sdkmanager --sdk_root="$ANDROID_HOME" platform-tools "platforms;android-34" \
  "build-tools;34.0.0" "ndk;27.3.13750724"

if [ "${1:-}" = --emulator ]; then
  sdkmanager --sdk_root="$ANDROID_HOME" emulator "system-images;android-34;google_apis;x86_64"
  if ! avdmanager list avd -c | grep -qx weight-test; then
    echo no | avdmanager create avd -n weight-test \
      -k "system-images;android-34;google_apis;x86_64" -d pixel_6
  fi
fi

if [ ! -x "$HOME/.vmodules/vab/vab" ]; then
  v install vab
  (cd "$HOME/.vmodules/vab" && v -o vab .)
fi
mkdir -p "$HOME/.local/bin"
ln -sf "$HOME/.vmodules/vab/vab" "$HOME/.local/bin/vab"

vab doctor
echo
echo "Done. Add the lines in tasks/android-env.sh to ~/.bashrc to use adb and vab from any shell."
