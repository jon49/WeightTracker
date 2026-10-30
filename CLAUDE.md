# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — dev server on :8008, proxying `/api/*` to a local TrailBase on :4000.
- `npm run start:full` — runs `start`, `server`, and `make -C ../ImageBase dev` (TrailBase backend) concurrently.
- `npm run build` — production build into `./deploy`.
- `npm run check` — `tsc --noEmit`.
- `npm test` — Playwright tests.
- `npm run fmt` / `fmt:check` — format with oxfmt.
- `npm run build:native` / `install:native` / `test:native` — the native desktop and Android client in `native/`, written in V (`make -C native android` for the APK). See `native/README.md`.
- `tasks/*.sh` — one script per command the user runs by hand (setup, building and installing the APK, the emulator, phone logs, tests). When telling the user to run a command they will want again, add or update a script here.

The `/api` path is owned by TrailBase (separate repo at `../ImageBase`).

## Native client

`native/` is a second client, written in V on gg/sokol (the same stack as `../soccer/native`, which started from this one; keep the two `gui/` toolkits and Android glue alike where they overlap). It syncs with the same TrailBase endpoint (`/api/data/weight`) and stores records under the same keys and shapes as the web client, so changes to a record's shape, its key, or the sync protocol must be made in both clients.
