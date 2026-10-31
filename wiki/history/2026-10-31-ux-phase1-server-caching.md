---
title: "2026-10-31: UX audit Phase 1, server caching"
kind: history
summary: The audit's cold paths closed on the server (pinned sets, cached facets, tiles and home rows, a patched Whisparr projection, conditional /api GETs, lighter cards) and the gender switch made page-local.
tags: [history, caching, performance, whisparr, home, performers]
status: record
date: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
related: [2026-10-31-ux-audit, caching, whisparr-shelf, home-feed, stash-layer, people-pages, gender-switch-performers-page-only, roadmap]
---

# 2026-10-31: UX audit Phase 1, server caching

One initiative, one commit, from the server findings F1, F2, F6, F7, F9 and the client's F10
in `docs/audits/2026-10-31-ux/` ([[2026-10-31-ux-audit]]), plus the decision
[[gender-switch-performers-page-only]].

## What changed

- **PINNED** (`cache/memory.ts`): a memory-only tag the volatile cap never sweeps, on the
  unfiltered facet set, the tile set, `sceneStashIdMap` and Whisparr's movie list. The
  per-filter facet sets and Whisparr's queue and grabs stay VOLATILE under the cap of 60
  ([[caching]]).
- **Computed answers cached** (`computed()` in `stash.ts`, `homeRows` in `api.ts`): the facets
  per filter set, the tag tiles and the finished home feed per visit seed are cached and
  snapshotted, so a deploy answers them without Stash. `MemoryCache.get` gained `freshInputs`
  (AsyncLocalStorage): while such a loader runs, its cached reads wait for their refresh instead
  of being served stale, so change detection stays right: a rating leaves facets, tiles and the
  feed stale (served once, rebuilt from fresh pieces), it never re-stores old pieces as fresh.
  The feed is also dropped (`home-rows`) by pinned-row, Settings `people`/`featured` and
  block/unblock writes ([[home-feed]]).
- **Whisparr's list as a projection** (`PROJECTED`, `project()` in `whisparr.ts`): the 16
  fields flix reads, one cover each; a Get or delete patches it in place (`dataCache.patch`) and
  drops only `whisparr:activity` ([[whisparr-shelf]], [[whisparr-api]]). Whisparr v3 has no
  performer or studio filter on `/movie` (checked 2026-10-30), so the full list stays.
- **Conditional `/api` GETs** (`conditional.ts`): weak ETag over the JSON inside `compress`, plus
  `Cache-Control: private, no-cache`; unchanged answers are 304s ([[caching]]).
- **Cards without performer images**: `SCENE_CARD` selects `performers { id name }`;
  `SCENE_DETAIL` and `activityScenes` add `image_path` where an avatar is shown ([[stash-layer]]).
- **Gender switch page-local**: `blocklist.ts` people criteria, `recommendations`, `stats` and
  search's `findPerformers` no longer read `performerGender`; `GET /api/performers?gender=`
  defaults to `all`; `Directories.tsx` keeps the choice in `flix.performers.gender` and shows
  "Only this page" ([[people-pages]]). The setting is still accepted and stored, read by nothing.

## How it was verified

- `node scripts/check.mjs`: typecheck (server, shared, web), lint at the baseline, 94 server
  tests. New tests: `memory.test.ts` (pinned entries out of the sweep and the snapshot, a
  `freshInputs` loader waiting for its stale input, `patch`), `whisparr.test.ts` (the projection's
  fields and single cover; a Get patches the list and refetches only queue and grabs),
  `conditional.test.ts` (weak ETag, 304 on a match, gzip kept, writes and errors untouched).
- Measured live after the deploy (build 1c7f070): `/api/home` 17 ms, tiles 9 ms, facets 7 ms
  on a fresh process; a matching `If-None-Match` gives a 304 with no body. Numbers in
  [[caching]] under Measurements.

## Snags

- The home feed's rebuild now waits for a fresh Featured pool after a play (0.8 s) instead of
  ranking the stale pool; the user still sees the old feed at once for the same seed, but a
  Shuffle right after a play builds cold. Accepted for a correct cache; revisit if it shows.
- Web copy in Filters, People and Settings still says age and ethnicity apply to "one performer
  of your Settings gender"; those files belong to the copy initiative and were left alone.
