---
title: Run the headless mobile checks
kind: runbook
summary: The headless check scripts (overflow, touch player, drag-to-preview, mini-player round trip in Chrome and WebKit, scripted phone and desktop sessions), what they block, and the cleanup after a station run.
tags: [mobile, testing, headless, chrome, scripts]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [scripts/mobile-check.mjs, scripts/touch-check.mjs, scripts/card-check.mjs, scripts/mini-check.mjs, scripts/webkit-mini-check.mjs, scripts/phone-flow.mjs, scripts/desktop-check.mjs]
related: [mobile-first-ui, dev-setup, prod-checks-read-only, check-scripts-attached-to-stale-chrome, check-scripts-wrote-plays-to-stash, scripts-library, playwright-webkit-install-hangs, next-video-opens-docked-over-its-own-page]
---

# Run the headless mobile checks

Use after any UI change, before the commit. They drive headless Chrome at iPhone 17 Pro Max
size against a running Vite (`pnpm dev`, [[dev-setup]]) and need Chrome installed on the Mac.
Write to a scratch directory, not the repo.

## Steps

```sh
# per page: horizontal overflow (incl. content clipped at the layout root) + a screenshot
node scripts/mobile-check.mjs /tmp/m http://localhost:5174 / /browse /scene/<id>
#   env: W=932 H=430 (landscape), DESKTOP=1 (no touch), WAIT=<ms per page>, EVAL='<expr printed per page>'

# the player under touch: tap, relative seek-bar drag, tap on the bar, drag from the raised
# hit area, double tap, sideways swipe on the picture (scrubs), centre play/pause
node scripts/touch-check.mjs /tmp/t http://localhost:5174 /scene/<id>
#   env: W=932 H=430 for the sideways phone; each step prints the time it expects

# drag-to-preview on scene cards (drags 25 px: Chrome holds touchmoves inside its ~15 px slop)
node scripts/card-check.mjs /tmp/c http://localhost:5174 /browse

# the mini-player round trip: play, tap Home (docks), tap the picture / title / Expand (restores),
# then a related card, Back and the card again (each on its own page, never docked). Run it
# against a PRODUCTION BUILD: dev's StrictMode remount hides the scene-to-scene slot bug
# (next-video-opens-docked-over-its-own-page); against Vite dev only the Home steps mean anything
pnpm --filter @flix/web exec vite build
FLIX_SERVER=http://flix.lan pnpm --filter @flix/web exec vite preview --port 5175 --strictPort &   # proxies /api and /media like dev
node scripts/mini-check.mjs /tmp/mp http://localhost:5175 /scene/<id>

# the same round trip in real WebKit (iPhone 15 Pro Max emulation, touch), with the page's
# console, page errors and failed requests printed; needs Playwright, see below
node scripts/webkit-mini-check.mjs /tmp/wk http://localhost:5174 /scene/<id>
```

```sh
# a scripted phone session: steps as JSON (goto, tap, tapText, longpress, type, scroll, shot,
# full-page shot, targets = every control under 44 px); the UX audit's driver
STEPS='[{"goto":"/browse","targets":true},{"tapText":"Filters","shot":"sheet"}]' node scripts/phone-flow.mjs /tmp/pf http://localhost:5174

# a scripted desktop session: real mouse/keyboard via a scenario file (see scripts/examples/)
DESKTOP=1 node scripts/desktop-check.mjs /tmp/dc http://localhost:5174 scripts/examples/desktop-scenario.json
# loading states: LATENCY adds ms to every /api and /media answer (not Vite's modules: delaying
# those stalled the page past any wait), so a scenario whose "wait" is under it shoots the
# skeletons and placeholders the LAN would otherwise answer before the first shot (since 2026-10-31)
LATENCY=1500 node scripts/desktop-check.mjs /tmp/dc http://localhost:5174 phase4.json
```

`phone-flow` and `desktop-check` drive the app like a user (added 2026-10-31,
[[2026-10-31-ux-audit]]); they block the Stash writes but **not** the app's own database, so a
step must never confirm a playlist, block, favourite, rating, pin, station or settings change.
`phone-flow` also takes `STUB='{"/api/settings": {...}}'`: those GET API paths are answered
from the JSON given instead of the server (CDP `Fetch.fulfillRequest`), to show a state
production does not have, such as a Settings value or a wanted card's `requested` state; writes
are never stubbed. The wanted shelf sits below an infinite grid, so open it by script rather
than a tap ([[phone-flow-tap-below-infinite-grid-lands-on-a-card]]).
Performance numbers come from `scripts/perf-check.mjs` ([[perf-checks]]).

`webkit-mini-check` is the closest thing to an iPhone a session can drive: Playwright's WebKit
build, installed globally (`npm i -g playwright`, 1.58.2 at `/opt/homebrew/lib/node_modules/
playwright`, `PLAYWRIGHT=` to point elsewhere) plus `playwright install webkit` (~73 MB; its
unzip step hung on this Mac, [[playwright-webkit-install-hangs]]). It is still desktop WebKit
with a phone viewport, user agent and touch: it passed on 2026-10-31 while the user's phone
failed, so a pass does not clear a phone report. A `<video>` there only plays once muted.

Expected: `mobile-check` prints `overflow: none` (or the offending elements) per page and
writes `<outdir>/<page>.png`; `touch-check` prints the player state after each step;
`card-check` reports each gesture's outcome; `mini-check` and `webkit-mini-check` print the path
and dock state after each tap, end with `all restore paths work` (exit 1 otherwise) and save a
screenshot per step ([[mini-player]]). Read the screenshots.

## What they block

Every request that would record viewing is blocked and logged (`blocked: …`), so a gesture
test proves the write was attempted without touching Stash: `/api/scenes/*/play`,
`/activity`, `/markers*`, `/o`, `/rating`, `/api/scenes/delete`, `/api/whisparr/get/*`,
`/api/whisparr/get-remote/*`. An unblocked run once wrote plays to the real Stash
([[check-scripts-wrote-plays-to-stash]]); keep new write routes in that list.

## Notes

- Chrome starts on a free port (`--remote-debugging-port=0`) and writes it to the profile.
  _Until 2026-10-29_ the scripts used fixed port 9333 and silently attached to any Chrome left
  running there, so runs drove a stale page ([[check-scripts-attached-to-stale-chrome]]).
- A station run writes `station_resume` rows in the dev Postgres (`flix-db-1`, 127.0.0.1:5433);
  clear them afterwards ([[postgres-cnpg]]).
- Against production (`FLIX_SERVER=http://flix.lan`, [[prod-checks-read-only]]) only these
  scripts may be used, never a hand session.
- `EVAL` runs after the page settles and before the screenshot, and awaits a promise, so an
  async IIFE can drive the page first (click a control, `scrollIntoView` the last card, wait)
  and the screenshot shows the result. Used on 2026-10-31 to test the shelf's grid view
  ([[whisparr-shelf]]): the page's bottom is far below the shelf's sentinel, so
  `scrollTo(0, scrollHeight)` loads the library's next page, not the shelf's.

## If it fails

- Nothing loads: Vite is not on 5174 ([[port-5173-taken]]).
- The page looks stale: an old Chrome profile; delete the outdir and rerun.
