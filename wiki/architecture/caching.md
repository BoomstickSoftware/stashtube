---
title: Caching
kind: architecture
summary: The three cache layers (query results in memory with a disk snapshot, the browser's persisted queries, generated assets on disk), how each is invalidated, warmed and measured; the goal is that Stash does only real work.
tags: [caching, performance, server, stash]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [apps/server/src/cache/memory.ts, apps/server/src/cache/assets.ts, apps/server/src/conditional.ts, apps/server/src/warm.ts, apps/server/src/admin.ts, apps/web/src/main.tsx]
related: [stash-layer, cache-admin, config-env, stash-database-locked, media-proxy, ratings-expire-lists, whisparr-shelf, home-feed, 2026-10-31-ux-phase1-server-caching]
---

# Caching

Goal: Stash does only real work. Every read is cached somewhere; only streams and writes are
not. Env knobs and defaults: [[config-env]]. Admin: [[cache-admin]].

## Layers

| Layer | Where | What | Freshness |
|---|---|---|---|
| Query results | memory (`cache/memory.ts`, `dataCache` in `stash.ts`), snapshot to `CACHE_DIR/data.json` every 2 min and on SIGTERM/SIGINT, restored at boot. Two tags keep raw working sets out of the snapshot: `VOLATILE` (the per-filter facet sets, Whisparr's queue and grabs) is **capped at 60 entries in total, oldest out** (`maxVolatile` in `stash.ts`; _30 until 2026-10-31_, when paging the StashDB shelf 31 times evicted the facets and tiles: facets 24 ms → 2.2 s, 278 of 401 misses since that day's restart were this eviction, see `docs/audits/2026-10-31-ux/server.md`); `PINNED` (since 2026-10-31: the unfiltered facet set, the tile set, `sceneStashIdMap`, Whisparr's movie list, a 16-field projection of its **41 MB / 13,079 entries**, [[whisparr-shelf]]) is never swept, only dropped by its tags. The StashDB pages (~8 KB) and the Featured pool (2.3 MB) go to the snapshot like any query (_the pages were VOLATILE until 2026-10-31_); the file is ~3.3 MB | every GraphQL read, keyed by query+variables, plus the **computed answers** below | fresh for `DATA_CACHE_TTL_MINUTES` (360), then served stale for up to `DATA_CACHE_STALE_HOURS` (168) while one background refresh runs; concurrent identical reads share one request; Stash calls time out after 60 s; at most `DATA_CACHE_MAX_ENTRIES` (5000) |
| Computed answers | the same cache, snapshotted: the facets per filter set (`facets`, 2–25 KB, tags `scene`, `activity:*`), the tag tiles (`tiles`, 21 KB gz, tags `scene`, `tag`), the finished home feed per visit seed (`home-rows`, TTL 5 min, tags `home-rows`, `scene`, `activity:*`, `performer`, `studio`, `featured-pool`) | `sceneFacets`, `tagTiles` (`computed()` in `stash.ts`), `homeRows` (`api.ts`) | since 2026-10-31; before, each was rebuilt on every request (facets 16–24 ms, tiles 19 ms, home 41 ms warm) and rebuilt from Stash after every deploy (1–2 s on Filters). Built with **`freshInputs`**: while the loader runs, the cached reads it makes wait for their refresh instead of being served stale, so a stale raw set is never re-stored as a fresh answer; the answer itself is still served stale while it rebuilds. Pinned by `memory.test.ts` |
| Browser | localStorage `flix.queries` (`main.tsx`, `PERSISTED` in `lib/api/client.ts`) | home feed (the current seed's only), settings, favourites, playlists, blocklist, session | up to 7 days; painted at once on a cold open, then refetched; stale queries also refetch when the app returns to the foreground; lists, a scene and its related row are kept 30 min in memory so Back finds them ([[web-app]]) |
| Assets | disk `CACHE_DIR/assets` (`cache/assets.ts`); metadata kept in memory after first use so a hit costs no file reads | screenshots, preview clips, sprites, VTTs, performer/studio/tag images | URLs carrying Stash's version stamp `?t=` never expire (browser: 1 year, immutable); the rest TTL `ASSET_CACHE_TTL_HOURS` (720), then revalidated by ETag (browser: 7 days); a file Stash sent without an ETag (its generated previews, sprites and VTTs) and every resized WebP copy gets flix's own weak one, `W/"flix-<size>-<fetchedAt>"` (base 36), so the browser's If-None-Match is answered 304 (since 2026-10-31; _before, those had no validator and were re-downloaded in full after 7 days_); flix's own tag is never sent to Stash, which gets If-Modified-Since or a plain refetch; stale copy served if Stash is down, answers 404 (it does while a scan locks its database) or a download breaks off; one fetch times out after 60 s, body included; new 404s remembered 1 min; "database is locked" retried with backoff; resized WebP copies (`?w=`, [[media-proxy]]) cached under their own keys; LRU under `ASSET_CACHE_MAX_MB` (5120 default, 15360 in k8s) |
| Not cached | | `/scene/<id>/stream*` (direct and HLS), all writes | |

## Invalidation

- **flix's own writes** go through `mutate(q, vars, invalidates, expires)`: `invalidates`
  are dropped, `expires` are marked stale (served once more while they refresh).
- **Plays and progress saves** (every 15 s while watching) drop only `scene:<id>` and the
  queries that filter or sort by activity (`activity:play`, `activity:resume`, set by
  `activityTags()`), and mark the rest of `scene` stale. _Until 2026-10-27_ they dropped every
  `scene` query, so watching anything left Home and Browse cold.
- **A rating, an O, a title or tag edit** drop only `scene:<id>` and mark `scene` stale (a tag
  edit also `tag`, for the scene counts on tag cards); a **performer favourite** drops
  `performer:<id>` and marks `performer` and `scene` stale. A list sorted by rating may lag one
  refresh, which the web hides by patching the card ([[ratings-expire-lists]]). _Until
  2026-10-31_ these dropped every `scene` entry (the favourite also every `performer`), so Home
  rebuilt cold (0.7–1.9 s, ~20 queries) after every tap on a star. Pinned by
  `stash.test.ts` ("writes and the query cache"). Deletes, Identify and the scene-destroy path
  still drop whole families.
- Whisparr: a Get or a delete **patches** the cached movie list in place (`dataCache.patch`:
  monitored, the added entry, the removed one) and drops only the queue and grabs
  (`whisparr:activity`); _until 2026-10-31_ they dropped the whole list, and the next shelf page
  re-downloaded 41 MB (1.3–4 s). The StashDB pages (`stashdb`) go only by their 10 min TTL
  ([[whisparr-shelf]]).
- The home feed (`home-rows`) is dropped by a pinned-row write, a Settings `people` or
  `featured` write, and block/unblock (their effect is not in any tag); plays, ratings and edits
  reach it through the tags its rows carry, like any list.
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
  whole query cache stale at once (served once more while it refreshes). The re-warm (home
  feed, facets, tiles, ~20 queries; `onStashChange` listeners in `index.ts`) is **debounced**:
  it runs only once the fingerprint has been unchanged for 2 polls in a row (about 2 min after
  the last change) and at most once per 5 min (`WarmDebounce` in `stash.ts`, pinned by
  `stash.test.ts`). _Until 2026-10-31_ every changed poll re-warmed, so a scan or a Whisparr
  import (3 changes in 14 min in the audit's pod log) warmed every minute against a locked
  database and threw away each previous warm's in-flight fetches. While the fingerprint keeps
  moving, pages refresh on demand only; the warm follows when Stash settles.
  `sceneSaveActivity` does **not** bump `updated_at`, so progress saves do not trigger it;
  `sceneUpdate` does (verified 2026-10-26, [[stash-api]]).

## Warming

At startup and once Stash has settled after a detected change (see the debounce above): the
home feed, the unfiltered facets (the filter dialog's counts) and the tag tiles are built in
the background. Daily at `WARM_AT_UTC`
(6) and from Settings → Cache, `warm.ts` pre-fetches every screenshot, preview and sprite (4 at
a time, fresh files skipped; sprites found through each VTT), and makes the resized copies the
cards ask for (screenshots at 640 and 960, entity images at 320). The pod log prints `warming:` for
anything it could not fetch ([[deploy-and-verify]]).

## Compression and conditional GETs

`/api/*` bodies are gzip'd (`hono/compress`); the home feed goes 108 KB → 17 KB (measured
2026-10-29). Since 2026-10-31 every successful `/api` GET also carries a weak ETag of its JSON
(`hono/etag` inside `compress`, `conditional.ts`) and `Cache-Control: private, no-cache`, so the
browser revalidates with `If-None-Match` and an unchanged answer is a 304 with no body: the
refetch storm on returning to the foreground costs headers, not bodies. Writes and errors carry
neither. Pinned by `conditional.test.ts`; _before, 0 of N `/api` requests were conditional_
(`docs/audits/2026-10-31-ux/client.md` F10).

## Measurements

- 2026-10-26: a cold home view cost Stash 7 queries and 79 asset fetches; a warm view cost nothing.
- 2026-10-27: cold `/api/home` 0.7–1.9 s, warm 4–8 ms; after a server restart it is answered
  from the restored snapshot (10 ms, 0 Stash queries).
- 2026-10-31 (audit, before the computed answers): warm `/api/home` 41 ms of CPU per call,
  `/api/scenes/facets` 16–24 ms warm and 1.2–2.2 s after a deploy or an eviction,
  `/api/tags/tiles` 19 ms warm. To re-measure after the change: `scripts/api-latency.sh`
  ([[perf-checks]]).
