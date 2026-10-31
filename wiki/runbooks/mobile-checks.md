---
title: Run the headless mobile checks
kind: runbook
summary: The four headless-Chrome scripts (overflow and screenshots, touch-driven player, drag-to-preview, mini-player round trip), their commands, what they block, and the cleanup after a station run.
tags: [mobile, testing, headless, chrome, scripts]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [scripts/mobile-check.mjs, scripts/touch-check.mjs, scripts/card-check.mjs, scripts/mini-check.mjs]
related: [mobile-first-ui, dev-setup, prod-checks-read-only, check-scripts-attached-to-stale-chrome, check-scripts-wrote-plays-to-stash, scripts-library]
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

# the mini-player round trip: play, tap Home (docks), tap the picture / title / Expand (restores)
node scripts/mini-check.mjs /tmp/mp http://localhost:5174 /scene/<id>
```

Expected: `mobile-check` prints `overflow: none` (or the offending elements) per page and
writes `<outdir>/<page>.png`; `touch-check` prints the player state after each step;
`card-check` reports each gesture's outcome; `mini-check` prints the path and dock state after
each tap, ends with `all restore paths work` (exit 1 otherwise) and saves a screenshot per
step ([[mini-player]]). Read the screenshots.

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
