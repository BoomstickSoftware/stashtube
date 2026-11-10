---
title: "2026-11-10: Hardening round H1 to H10"
kind: history
summary: The architecture fixes from the ground-up review as shipped: data-loss fixes, CI gates, fresh data on the phone, cache correctness, the server split into stash/ and routes/, one job registry, tests for delete and download, and what was left.
tags: [history, architecture, server, web, testing, caching]
status: record
date: 2026-11-10
verified: 2026-11-10
updated: 2026-11-10
related: [2026-11-10-architecture-and-ux-review, server-bff, stash-layer, caching, web-app, neutral-observability, roadmap]
---

# 2026-11-10: Hardening round H1 to H10

The findings are in [[2026-11-10-architecture-and-ux-review]]; current behaviour is in the pages
linked from each item.

## What changed

- **H1**: scene tags change as ADD/REMOVE deltas (Unlist, the tag editor), never a list read
  from a cached scene; the studio and category lists page until `total` (229 of 229 studios on
  production afterwards; it was 200 of 224); a router error component and a boundary round the
  player host ([[web-app]]).
- **H2**: the image build runs the web lint, a zero-warning lint of the server and shared
  package, and the web and script tests; `/assets/*` is gzipped (main chunk 98 kB on the wire,
  was 307 kB); an `unhandledRejection` logger.
- **H3**: `settings`, `favorite-scenes` and `session` are fresh for 5 minutes instead of for
  ever; the player takes newer scene details for the same id (a new marker shows); scene lists
  are fresh for 5 minutes and marker writes no longer invalidate them; the progress save also
  fires on `visibilitychange` and uses `keepalive`.
- **H4**: the query-cache snapshot carries the build version, and another build restores only
  raw upstream answers; a Stash change expires everything except Whisparr and StashDB entries
  ([[caching]]).
- **H5**: `stash.ts` is a barrel over 13 modules in `stash/`; a test fails if anything else
  imports the Stash schema; `api.ts` mounts ten sub-apps from `routes/`; Home and Featured
  assembly is `home.ts`; `UpstreamError` maps Stash, Whisparr and StashDB failures to 502;
  malformed JSON and a non-numeric id answer 400; a StashDB validation rejection no longer
  counts toward the pause; the guard re-reads the Gets before unmonitoring; bound SQL arrays;
  batched playlist writes; `GET /api/cast` and `GET /api/stations/resume` no longer write
  ([[server-bff]], [[stash-layer]], [[request-guard]]).
- **H6**: `jobs.ts`, one registry for the eleven background jobs: overlap guard, status on
  `GET /api/admin/cache` (`jobs`), last run persisted in `settings` as `job:<name>` for the
  guard, discovery and Continue expiry, so a deploy no longer re-runs the daily ones. The hourly
  category sync asks one fingerprint query and reads the library only when it changed.
- **H7**: server tests 155 → 209 (delete ordering, discovery eligibility, route validation, the
  job registry, the schema boundary); the web app's first 10 tests (vitest).
- **H8**, in part: the `<video>` is released on unmount in both players; a station stops after
  three videos in a row fail. The two players still have separate source and control code.
- **H10**: [[neutral-observability]].

## Snags

- A git pre-push hook that would run `check.mjs` (the privacy check cannot run in CI: its
  deny-list is not in git) was refused by the session's permission system. Not installed.
- The local dev Postgres is behind (migrations 0005 onward missing), so the mirror's
  `arrayContains` filter was tested for binding, not against real `sdb_scenes` rows, before deploy.

## Left for later

- One player core (`useVideoSource`, shared controls) for `Player.tsx` and `Station.tsx`.
- Zod-parsing StashDB and Whisparr responses; a typed route-to-response map in `@flix/shared`.
- `rows.reorderRows` and `stations.reorderStations` still write row by row.
- Query keys as one `keys` object in the web client; modal focus trapping inside sheets.
