# Weight (desktop)

A native client for the weight tracker, written in [V](https://vlang.io). It
does what the web app does (entries, the entry form with bedtime and wake up,
stats and charts, user settings, light and dark themes) and works offline. It
syncs with the same TrailBase backend, so the web and desktop clients share
data.

It currently targets Linux. macOS and Windows already type-check and generate C
(`make check`). iOS and Android are the next targets.

## Build and run

```sh
make run          # build and start
make build        # optimized ./weight
make install      # ./weight to ~/.local/bin, plus a launcher and icon
make test         # unit tests for core/ (dates, stats, charts, storage, sync)
make check        # type-check and generate C for Linux, Windows and macOS
```

Set `V=/path/to/v` if `v` is not on your `PATH`.

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
screen_*.v        the four screens
chart_view.v      draws core.ChartData with gg (lines, bars, two axes, tooltip, legend)
gui/              a small immediate-mode toolkit on gg: buttons, text fields, scrolling,
                  mouse, touch and keyboard. It knows nothing about the app.
core/             no GUI imports: models, dates, stats and charts, the JSON store,
                  and the TrailBase sync client
assets/fonts/     DejaVu Sans, embedded in the binary so text looks the same everywhere
```

The split exists for the mobile ports. `core` is plain V and reusable as is.
`gui` uses only `gg`/sokol, which also run on macOS, Windows, iOS and Android.
Touch input (tap, drag to scroll) and the on-screen keyboard
(`sapp.show_keyboard` on iOS and Android) are already handled.

## Data and sync

- All data is stored in one JSON file, `weight-data.json`. It goes in
  `~/.local/share/weight` on Linux, `~/Library/Application Support/Weight` on
  macOS, `%AppData%\Weight` on Windows, and the app's `Documents` folder on iOS.
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

One difference from the web app: Clear All Data keeps you logged in, so
synced data downloads again on the next sync.

## Porting notes

- **macOS:** expected to build as is with `make build`. Make an `.app` bundle
  for distribution.
- **Windows:** TLS uses V's bundled mbedtls. Check that HTTPS certificate
  validation finds the system roots there (it does on Linux).
- **iOS:** `v -os ios` currently stops inside V's own `net` module
  (`unknown struct Ip6`): vlib/net defines `Ip6` per OS and has no iOS file.
  That needs fixing in V, or the sync calls need routing through
  `NSURLSession`. Everything is in `core/sync.v`'s `post_json`. Also store
  tokens in the Keychain instead of `auth.json`.
- **Android:** build with `vab`. Give `core.default_data_dir` an `$if android`
  branch for the app's internal files directory.
- Safe-area insets (notch, home indicator) are not handled yet.

Text fields are single-line except the comment, which grows with its text.
Enter adds a line there; Ctrl+Enter or clicking elsewhere saves. Clipboard
paste is not supported yet because `gg` does not expose sokol's clipboard
switch.
