---
title: Caching
kind: architecture
summary: The three cache layers (query results in memory with a disk snapshot, the browser's persisted queries, generated assets on disk), how each is invalidated, warmed and measured; the goal is that Stash does only real work.
tags: [caching, performance, server, stash]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [apps/server/src/cache/memory.ts, apps/server/src/cache/assets.ts, apps/server/src/warm.ts, apps/server/src/admin.ts, apps/web/src/main.tsx]
related: [stash-layer, cache-admin, config-env, stash-database-locked, media-proxy]
---

# Caching

Goal: Stash does only real work. Every read is cached somewhere; only streams and writes are
not. Env knobs and defaults: [[config-env]]. Admin: [[cache-admin]].

## Layers

| Layer | Where | What | Freshness |
|---|---|---|---|
| Query results | memory (`cache/memory.ts`, `dataCache` in `stash.ts`), snapshot to `CACHE_DIR/data.json` every 2 min and on SIGTERM/SIGINT, restored at boot. Entries tagged `VOLATILE` (facet and tag-tile working sets, `sceneStashIdMap`, every StashDB page and Whisparr's movie list, which is **41 MB / 13,079 entries** on 2026-10-31, _was ~25 MB until then_) stay in memory only, **at most 30 of them in total, oldest out**: paging the StashDB shelf 31 times evicts facets and tiles (facets 24 ms → 2.2 s, reproduced 2026-10-31; 278 of 401 misses since that day's restart were this eviction, not the LRU bound, see `docs/audits/2026-10-31-ux/server.md`), and they are re-warmed; the Featured pool (2.3 MB) is snapshotted since 2026-10-31, the file is ~3.3 MB | every GraphQL read, keyed by query+variables | fresh for `DATA_CACHE_TTL_MINUTES` (360), then served stale for up to `DATA_CACHE_STALE_HOURS` (168) while one background refresh runs; concurrent identical reads share one request; Stash calls time out after 60 s; at most `DATA_CACHE_MAX_ENTRIES` (5000) |
| Browser | localStorage `flix.queries` (`main.tsx`, `PERSISTED` in `lib/api/client.ts`) | home feed (the current seed's only), settings, favourites, playlists, blocklist, session | up to 7 days; painted at once on a cold open, then refetched; stale queries also refetch when the app returns to the foreground; lists, a scene and its related row are kept 30 min in memory so Back finds them ([[web-app]]) |
| Assets | disk `CACHE_DIR/assets` (`cache/assets.ts`); metadata kept in memory after first use so a hit costs no file reads | screenshots, preview clips, sprites, VTTs, performer/studio/tag images | URLs carrying Stash's version stamp `?t=` never expire (browser: 1 year, immutable); the rest TTL `ASSET_CACHE_TTL_HOURS` (720), then revalidated by ETag (browser: 7 days); stale copy served if Stash is down, answers 404 (it does while a scan locks its database) or a download breaks off; one fetch times out after 60 s, body included; new 404s remembered 1 min; "database is locked" retried with backoff; resized WebP copies (`?w=`, [[media-proxy]]) cached under their own keys; LRU under `ASSET_CACHE_MAX_MB` (5120 default, 15360 in k8s) |
| Not cached | | `/scene/<id>/stream*` (direct and HLS), all writes | |

## Invalidation

- **flix's own writes** go through `mutate()`, which drops the tags they affect (`scene`,
  `scene:<id>`, `performer`, …).
- **Plays and progress saves** (every 15 s while watching) drop only `scene:<id>` and the
  queries that filter or sort by activity (`activity:play`, `activity:resume`, set by
  `activityTags()`), and mark the rest of `scene` stale. _Until 2026-10-27_ they dropped every
  `scene` query, so watching anything left Home and Browse cold.
- **In-flight reads**: a fetch that was running when one of its own tags changed is not stored
  and is no longer joined by new reads; a fetch with other tags is kept. _Until 2026-10-31_ any
  invalidate or expire (so every progress save) threw away every running fetch, so a slow
  whole-library query could be refetched over and over while a video played.
- `firstSceneYear` (which every list's exclusions wait on) is tagged `library`, not `scene`, so
  a rating or tag edit does not drop it; a Stash change refreshes it with everything else.
- The Featured pool is tagged `featured-pool`: any write that touches `scene*` or `activity*`
  only expires it (`mutate`), so it is served stale while it refreshes ([[featured-ranking]]).
- **Changes made in Stash** (scans, Identify, edits in its UI) are caught by a change check:
  one query every `CHANGE_POLL_SECONDS` (60), only while flix has been used in the last 10
  minutes. It compares each type's count and newest `updated_at`; any difference marks the
  whole query cache stale (served once more while it refreshes) and re-warms the home feed.
  `sceneSaveActivity` does **not** bump `updated_at`, so progress saves do not trigger it;
  `sceneUpdate` does (verified 2026-10-26, [[stash-api]]).

## Warming

At startup and after each detected Stash change: the home feed, the unfiltered facets (the
filter dialog's counts) and the tag tiles are built in the background. Daily at `WARM_AT_UTC`
(6) and from Settings → Cache, `warm.ts` pre-fetches every screenshot, preview and sprite (4 at
a time, fresh files skipped; sprites found through each VTT), and makes the resized copies the
cards ask for (screenshots at 640 and 960, entity images at 320). The pod log prints `warming:` for
anything it could not fetch ([[deploy-and-verify]]).

## Compression

`/api/*` bodies are gzip'd (`hono/compress`); the home feed goes 108 KB → 17 KB (measured
2026-10-29).

## Measurements

- 2026-10-26: a cold home view cost Stash 7 queries and 79 asset fetches; a warm view cost nothing.
- 2026-10-27: cold `/api/home` 0.7–1.9 s, warm 4–8 ms; after a server restart it is answered
  from the restored snapshot (10 ms, 0 Stash queries).
