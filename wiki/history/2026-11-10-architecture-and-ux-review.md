---
title: "2026-11-10: Ground-up review of architecture and UX, and the neutral script suite"
kind: history
summary: A five-agent read-only review of the server, the web app and the UI, internet research on user delight, and a new content-neutral observability suite; what was found, measured and put on the roadmap.
tags: [history, architecture, ux, audit, performance, privacy]
status: record
date: 2026-11-10
verified: 2026-11-10
updated: 2026-11-10
related: [roadmap, ux-delight-principles, neutral-observability, content-neutral-sessions, 2026-11-09-strategy-review, 2026-10-31-ux-audit]
---

# 2026-11-10: Ground-up review of architecture and UX, and the neutral script suite

Five agents in one workflow: server, web engineering, the neutral scripts (built), a UI audit
from code, and web research. Nothing in `apps/` changed; findings are from code reading unless
a measurement is named. The ordered work is in [[roadmap]].

## Verdict

- **Server**: reliable and fast. Against production, 34 routes × 3 samples: every warm route
  5–20 ms; slowest cold 558 ms (a shelf page), `/api/home` 50 ms cold. 155 tests pass.
  Maintainability is slipping in `stash.ts` (1,781 lines) and `api.ts` (1,023 lines, 113 routes).
- **Web**: strict types, one fetch wrapper, the single hosted `<video>` and clock store are
  sound. Reliability is the weak axis: no error boundary, no web tests.
- **UI**: good shell, tokens and recovery (Undo toasts); no component system and almost no
  touch feel (223 `hover:` classes against 4 `active:`/`focus-visible:`).

## Server findings (ranked)

1. Tag writes read-modify-write from a cached scene (`setReservedTag`), so an Unlist soon after
   a sync or bulk edit can drop newer tags. Derived, not reproduced.
2. CI runs less than `check.mjs` (no lint, no privacy check); the server is unlinted; no
   `unhandledRejection` handler.
3. The Stash boundary leaks into `api.ts` and `settings.ts`; Home and Featured assembly live in
   the route file; `dataCache` lives in `stash.ts` but serves three upstreams.
4. The query-cache snapshot has no build stamp: a deploy can serve old-shaped computed answers.
5. Eight hand-rolled background runners; "daily" means "since process start", so each deploy
   re-runs them; three whole-library reads run hourly when idle.
6. `getqueue`, `delete`, `catalog`, `sweep`, `playlists`, `stations`, `auth` and `api` have no tests.
7. Only `StashError` maps to 502; Whisparr and StashDB failures are a bare 500; about 20 routes
   pass an unvalidated id.
8. A StashDB schema rejection counts toward the 5-failure pause.
9. The guard can unmonitor a scene requested mid-run (narrow window).
10. A Stash change expires every cache entry, including Whisparr's 41 MB list.
11. 7 `satisfies` across 113 routes: the shared contract is only partly enforced.
12. Lower: `sql.raw` arrays in `catalog.ts`, a hardcoded NAS path prefix, chatty bulk writes,
    two GETs that write (`/api/cast`, `/api/stations/resume`), dead `dropBlocked` code.

## Web findings (ranked)

1. Lists silently truncated: studios 200 shown of 224, tags 1,000 of 1,240 (measured).
2. No error boundary; a player throw takes the page, and the installed app has no reload.
3. `settings`, `favorite-scenes` and `session` are persisted with `staleTime: Infinity` and
   never refresh from the server (inferred).
4. The player keeps a stale scene snapshot: a new marker is not on the seek bar until reopen.
5. Infinite lists refetch every page on focus; marker writes invalidate all of `['scenes']`.
6. No web tests, though `lib/query`, `lib/station`, `lib/playback`, `lib/update` are pure.
7. `Player.tsx` and `Station.tsx` duplicate source fallback, auto-hide, keys and chrome; the
   station skips on error with no cap.
8. JS and CSS are served uncompressed: 526 kB where about 156 kB gzipped would do (measured).
9. Lower: `<video>` not released on unmount, sheets lack modal mechanics, scattered query keys,
   a Stash resolution enum in the Player, the last progress save can be lost on iOS.

## UI findings

Six modal shells, five segmented-control looks, 160 raw `<button>` against 53 `<Button>`, an
ambiguous primary colour, 11 z values, 18 icon sizes. Resume costs four taps since the
five-tab change. Controls under 44 px in the player bar, the dock, Stations, Playlists and the
filter dialog. Playlists cannot be reordered on a phone. Two `window.confirm` calls remain.

## Neutral suite (built, uncommitted at the time of writing)

`scripts/neutral.mjs` and `scripts/lib/neutral*.mjs`; neutral screenshots by default in
`phone-flow`, `mobile-check`, `desktop-check`; `--neutral` on the Python clients. Verified live,
read-only: [[neutral-observability]]. Decision: [[content-neutral-sessions]].

Found on the way: the blocked pattern `*/api/scenes/*/play` in the headless scripts also blocks
`GET /api/scenes/<id>/playlists`, so the playlist dialog never loads under the checks.

## Wiki drift found, not yet fixed

- `stash-layer`: "nothing else knows Stash's schema" is false; `exclusions()` is in
  `blocklist.ts`; `dropBlocked` is dead.
- `server-bff`: module map omits ten modules; "69 tests" is 155.
- `data-model`: omits `whisparr_gets`, `whisparr_watch`, `get_queue`, the `sdb_*` tables and
  four settings; `station_resume` keeps only `id:` and `pl:` keys.
- `request-guard`: two GETs write. `caching`: a Stash change also expires the other upstreams.
- `web-app`: omits four routes, four API files and seven helpers; chunk sizes are 306.7 kB
  and 132.6 kB; persisted queries do not all refetch.
- `mobile-first-ui`: the 44 px rule does not hold in the player bar, dock and station buttons.
