# Weight (native)

A native client for the weight tracker, written in [V](https://vlang.io). It
does what the web app does (entries, the entry form with bedtime and wake up,
stats and charts, user settings, light and dark themes) and works offline. It
syncs with the same TrailBase backend, so the web and native clients share
data.

It builds and runs on Linux and Android. Windows and macOS type-check and
generate C (`make check`); iOS waits on a fix in V (see below). The code is
shared; only packaging and a few platform details differ.

## Build and run

```sh
make run          # build and start
make build        # optimized ./weight
make install      # ./weight to ~/.local/bin, plus a launcher and icon
make test         # unit tests for core/ (dates, stats, charts, storage, sync)
make check        # type-check and generate C for Linux, Windows and macOS
make android      # ./weight.apk (needs the Android SDK, NDK and vab)
make install-apk  # install it on the connected phone or emulator
```

Set `V=/path/to/v` if `v` is not on your `PATH`. From the repo root,
`npm run build:native`, `npm run install:native` and `npm run test:native`
do the same, and `tasks/` has a script for each job, including the one-time
setup: `desktop-setup.sh`, `desktop-run.sh`, `desktop-install.sh`,
`android-setup.sh`, `make-apk.sh`, `install-apk.sh`, `android-devices.sh`,
`android-logs.sh`, `android-emulator.sh` and `test-native.sh`.

Options: `weight [--data-dir DIR] [--size WxH] [--screen entry|entries|charts|settings] [--charts history,average,...]`.
`--size` and `--screen` are handy for checking the phone-sized layout.

### System packages

- **Linux (X11, which also runs under XWayland):**
  `sudo apt install libx11-dev libxi-dev libxcursor-dev libxrandr-dev libgl-dev libegl-dev`
- **Linux, native Wayland:** build with `v -d sokol_wayland` and install
  `libwayland-dev libxkbcommon-dev libegl-dev wayland-protocols`.
- **macOS:** the Xcode command line tools (`xcode-select --install`).
- **Windows:** nothing beyond V and its C compiler. Use `make build` or `v -prod -o weight.exe .`.

## Layout

```
main.v            entry point: window, embedded fonts, event wiring
app.v             app state, header and navigation, toasts, sync and login workers
screen_*.v        the four tabs (entry, entries, charts, settings), and login,
                  register and reset password (screen_account.v)
chart_view.v      draws core.ChartData with gg (lines, bars, two axes, tooltip, legend)
platform_*.c.v    per-platform bits: Android's data folder, screen density,
                  HTTPS roots, keyboard, insets and Back button
android/          the Android manifest and activity (Java), and the JNI
                  bridge between them and the app (text_bridge.h)
gui/              a small immediate-mode toolkit on gg: buttons, text fields, drop-downs,
                  scrolling both ways, mouse, touch and keyboard. It knows
                  nothing about the app.
core/             no GUI imports: models, dates, stats and charts, the JSON store,
                  and the TrailBase sync client
assets/fonts/     DejaVu Sans, embedded in the binary so text looks the same everywhere
```

`core` is plain V and reusable as is. `gui` uses only `gg`/sokol, which also
run on macOS, Windows, iOS and Android.

## Data and sync

- All data is stored in one JSON file, `weight-data.json`. It goes in
  `~/.local/share/weight` on Linux, `~/Library/Application Support/Weight` on
  macOS, `%AppData%\Weight` on Windows, the app's `Documents` folder on iOS,
  and the app's private files folder on Android.
  Override with `--data-dir` or `$WEIGHT_DATA_DIR`. Every change rewrites the
  file atomically. Login tokens are kept separately in `auth.json` (mode 0600).
- Records use the web client's shape and keys (`YYYY-MM-DD`, `user-settings`).
  Sync uses the same `POST /api/data/weight` last-write-wins protocol and
  TrailBase's `/api/auth/v1/{login,refresh,logout}`.
- Sync runs at startup, 3 seconds after an edit, when the window regains focus
  (at most once a minute), and on demand (the ↻ button or Ctrl+R). Edits made
  while a sync is in flight are kept and uploaded on the next sync.
- If another device changed `user-settings` since the last sync, the server
  reports a conflict. The app keeps its own values, fills in the ones it lacks
  (such as height), keeps the earlier start date, and uploads the merge.
- Chart settings stay on each device, as on the web.
- Login, Register and Reset Password are screens of their own, like the
  web app's pages, opened from Settings or the header's Login button; they
  go back to the tab they were opened from. The links they email
  (verifying the address, setting a new password) open the web app.
- The theme follows the system's light or dark mode (checked again when the
  window regains focus). ☾/☀ overrides it on this device; toggling back to
  what the system shows follows the system again.

One difference from the web app: Clear All Data keeps you logged in, so
synced data downloads again on the next sync.

## Phones

Touch (tap, drag to scroll) and the on-screen keyboard are handled.

- **Android** (6.0 and up, OpenGL ES 3.1): install the SDK (platform 34,
  build-tools 34), NDK r27 and [vab](https://github.com/vlang/vab), set
  `ANDROID_HOME` and `ANDROID_NDK_ROOT` (`tasks/android-setup.sh` does all
  of it), then `make android`. It is built the same way as `../soccer/native`;
  the things that differ from the desktop are all in `platform_android.c.v`
  and `android/`:
  - `android/AndroidManifest.xml` replaces vab's, which lacks the INTERNET
    permission. vab edits nothing in a manifest you supply, so the package
    id, version and SDK levels are written there too; keep them in step with
    the Makefile.
  - `android/src/io/v/android/VActivity.java` replaces vab's activity.
    sokol drops Android's key events and can't show the keyboard, so a
    hidden view takes the keyboard's input (including words it is still
    composing) and passes characters, Backspace and Enter to the app through
    `android/text_bridge.h`. It also reports what the status bar and keyboard
    cover, so the gui lays out between them and scrolls the focused field
    into view.
  - sokol ends the app on Back. A `#flag` hides Back from it, so Java gets
    it: Back goes from Register or Reset
    Password to Login and from Login to the tab it was opened from, then
    to Entry, and on Entry puts the app in the background.
  - Text is scaled by the screen's density; gg on Android would fit the
    window size we ask for to the screen instead.
  - V's TLS looks for a CA bundle in the usual Linux places. Android keeps
    one file per root, so they are joined into `ca-roots.pem` in the data
    folder at startup and `$SSL_CERT_FILE` points at it.
  - `-d sokol_gles3`: vab builds sokol for GLES 3 but doesn't tell V, and
    gg would compile desktop GLSL. `-prod` for an optimized build (vab
    signs it with its debug key; pass `--keystore` for a release).
  - stderr goes to logcat (`tasks/android-logs.sh`), for sokol's messages.
  - The emulator's default software GPU only has GLES 3.0; start it with
    `-gpu swangle_indirect` (or `host`).
  - The theme follows the system's dark mode, also when it changes while
    the app is open (`uiMode` in the manifest's `configChanges` keeps the
    activity, and `VActivity.onConfigurationChanged` tells the app).
  - The launcher icon is adaptive (`android/res/`, the logo drawn as vector
    drawables); Android 6 and 7 use `src/web/images/weight.png`.
  - Not done: a hardware keyboard's keys (sokol drops them).
- **iOS:** `v -os ios .` stops inside V's own `net` module
  (`unknown struct Ip6`): `vlib/net` defines its address structs per OS and
  has no iOS variant. That needs fixing in V (or routing `core/sync.v`'s
  `post_json` through `NSURLSession`). Also keep tokens in the Keychain
  instead of `auth.json`, and handle safe-area insets.
- **Windows:** TLS uses V's bundled mbedtls. Check that HTTPS certificate
  validation finds the system roots there (it does on Linux).
- **macOS:** expected to build as is with `make build`. Make an `.app` bundle
  for distribution.

## Keyboard and mouse

- **Text size:** Ctrl + and Ctrl − (also Ctrl with the scroll wheel, or the
  keypad + and −), Ctrl 0 to reset, or Settings → Text size. It changes in 10% steps from 50%
  to 300% and is saved between runs.
- **Scrolling:** the wheel, dragging the scroll bar or clicking its track,
  and, when no field is focused, Page Up/Down, Home/End (with or without Ctrl) and the arrow keys.
  The entries table and the tabs scroll sideways when they don't fit: Shift
  with the wheel, a sideways wheel or touchpad, their scroll bar, or a
  sideways swipe on a phone. The table's date column and header row stay
  in view, as in `../soccer`'s stats tables.
- **Sync now:** Ctrl+R.

Text fields are single-line except the comment, which grows with its text.
Enter adds a line there; Ctrl+Enter or clicking elsewhere saves. Clipboard
paste is not supported yet because `gg` does not expose sokol's clipboard
switch.
