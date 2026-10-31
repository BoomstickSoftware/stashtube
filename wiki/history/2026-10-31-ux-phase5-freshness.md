---
title: "2026-10-31: UX audit Phase 5, freshness and errors"
kind: history
summary: Rollbacks on failed writes, progress and the Continue badge patched after each save, Identify waited for on the server, a Requested wanted state, a player error state and a performer-defaults chip.
tags: [ux, freshness, errors, player, whisparr, audit]
status: record
date: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
related: [2026-10-31-ux-audit, failed-writes-toast-only, web-app, caching, player, whisparr-shelf, moments, continue-history-stats, browse-and-filters, scene-page, roadmap]
---

# 2026-10-31: UX audit Phase 5, freshness and errors

The remaining freshness and error lines of Phase 5 in [[roadmap]], from
[[2026-10-31-ux-audit]] (IA F1, F3, F6, F16, F18 and row 18 of its freshness table), under
[[failed-writes-toast-only]], [[stash-owns-activity]], [[prod-checks-read-only]] and
[[whisparr-nothing-monitored]].

## What changed

- **Rollbacks** ([[web-app]]): `useRateScene`, `useRatePerformer`, `useFavoritePerformer`,
  `useFavoriteStudio` and `useFavoriteTag` capture the cached value in `onMutate` and put it
  back everywhere in `onError`; the global toast still says why. `useRatePerformer` now also
  patches the performer grid. Moments' "Removed · Undo" toast moved to the delete's `onSuccess`
  ([[moments]]).
- **Progress and the Continue badge** ([[continue-history-stats]]): `addPlay` bumps
  `playCount` and `saveActivity` patches `resumeTime` into every cached card after Stash
  answers; a resume point appearing or going nudges `['scenes','continue-count']` and refetches
  it and the Continue list. `patchScene` is exported and takes a function patch.
- **Identify** ([[scene-page]], [[caching]]): `identifyScene` in `stash.ts` starts the job
  and polls `findJob` every second for up to 40 s, answering the finished `JobStatus` (200) or
  the running one (202) and then following it in the background (`followJob`) so the caches
  drop without a client. The web's hook-level `onSuccess` invalidates the scene even after the
  page is gone; a still-running job is remembered in `pendingIdentify` and polled on the next
  visit. `identify.test.ts` pins the wait, the timeout and a vanished job.
- **Requested** ([[whisparr-shelf]]): a `requested` `WantedState`; the server remembers Get's
  movie ids for an hour (`requested` map) and `stateOf` reports it when Whisparr shows neither
  a grab nor a queue entry; Get's answer is patched into the cached shelf and Home row before
  the refetch. The card shows a "Requested" pill instead of Get.
- **Player error state** ([[player]]): hls.js fatal errors are dispatched as the element's
  `error` event; the Player shows "Can't play this video" with "Try again" over the controls
  (the centre buttons and the play button hide); the station player's existing fallback-then-
  skip now sees HLS failures too. Dev-only `?src=missing` hook.
- **Performer defaults chip** ([[browse-and-filters]]): `PeopleDefaultsChip` under the active
  filters when Settings' people defaults apply (no own People filter, Show blocked off),
  linking to `/settings#feed`.
- `scripts/phone-flow.mjs` gained `STUB` (stubbed GET API answers) to show states production
  lacks ([[mobile-checks]]).

## How it was verified

- `node scripts/check.mjs`: typecheck, web tsc, lint 5 warnings (baseline 5), 109 server
  tests (3 new in `identify.test.ts`, 1 new in `whisparr.test.ts`).
- Headless against production through Vite on :5184 (read-only): `phone-flow` with a stubbed
  `/api/settings` showed the chip on Browse and a tap landed on `/settings#feed` (scrollY 861);
  `/scene/2775?src=missing` showed the error state on the phone and at 1440 px
  (`desktop-check`), and Try again returned to it; a stubbed shelf page rendered "Requested"
  (the eval found it; the screenshot shows the library grid, see Snags). A normal scene showed
  no error.
- Not verified live, by design: the rollbacks, the progress patch and the Requested flow need a
  write, which the check scripts block ([[prod-checks-read-only]]); the server tests cover the
  server halves and the typecheck the hooks.

## Snags

- The first error overlay sat under the tap surface and the centre buttons, so the big play
  button showed through it: it now renders last in the wrapper with `z-10`, and the centre and
  play buttons hide while failed.
- A `tapText` on the wanted shelf's heading opened a scene instead: the shelf sits below the
  infinite library grid, which loaded more cards under the tap
  ([[phone-flow-tap-below-infinite-grid-lands-on-a-card]]).
