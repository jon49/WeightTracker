# Weight native app (desktop and Android). Requires V (https://vlang.io); see README.md for the
# system packages each platform needs.
V ?= v
# Extra V flags, e.g. VFLAGS='-d sokol_wayland' for a native Wayland build.
VFLAGS ?=
BIN ?= weight
PREFIX ?= $(HOME)/.local

.PHONY: build dev run test fmt check android install-apk install uninstall clean

build:
	$(V) $(VFLAGS) -prod -o $(BIN) .

dev:
	$(V) $(VFLAGS) -g -o $(BIN) .

run:
	$(V) $(VFLAGS) run . $(ARGS)

test:
	$(V) test core

fmt:
	$(V) fmt -w .

# Type-checks and generates C for each target without needing its SDK.
check:
	@mkdir -p .check
	$(V) -o .check/linux.c -os linux .
	$(V) -o .check/windows.c -os windows .
	$(V) -o .check/macos.c -os macos .
	@rm -rf .check

# Android APK. Needs the Android SDK and NDK and vab; see README.md.
# vab builds sokol for GLES 3 but doesn't tell V, so gg would hand the GLES
# driver desktop GLSL; `-d sokol_gles3` makes it pick its GLSL ES shaders.
# -prod: optimized, as a phone should get it. vab warns that it signs with
# its debug key; pass --keystore for a release.
# ARCHS: the processor types to build for, comma separated. Phones are
# arm64-v8a (each type adds a copy of the app); install-apk builds for the
# connected device instead, as the test emulator is x86_64.
# The fonts are embedded in the app (main.v), so only their license goes in
# the APK's assets.
ARCHS ?= arm64-v8a
android:
	vab -prod -f '-d sokol_gles3' --name Weight --package-id com.jnyman.weight --version-code 1 --min-sdk-version 23 \
		--archs $(ARCHS) -a fonts/LICENSE-DejaVu.txt \
		--package-overrides android --icon ../src/web/images/weight.png -o $(BIN).apk .

# Install the APK on the connected phone or emulator (adb from the SDK's
# platform-tools).
install-apk: ARCHS = $(or $(shell adb shell getprop ro.product.cpu.abi 2>/dev/null | tr -d '\r'),arm64-v8a)
install-apk: android
	adb install -r $(BIN).apk

install: build
	install -Dm755 $(BIN) $(PREFIX)/bin/$(BIN)
	install -Dm644 ../src/web/images/weight.svg $(PREFIX)/share/icons/hicolor/scalable/apps/weight.svg
	install -Dm644 weight.desktop $(PREFIX)/share/applications/weight.desktop

uninstall:
	rm -f $(PREFIX)/bin/$(BIN) $(PREFIX)/share/icons/hicolor/scalable/apps/weight.svg \
		$(PREFIX)/share/applications/weight.desktop

clean:
	rm -rf $(BIN) $(BIN).exe $(BIN).apk .check
