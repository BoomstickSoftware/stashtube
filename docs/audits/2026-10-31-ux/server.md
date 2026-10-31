# flix server-side performance and caching audit

Date: 2026-10-31 (evening). Build audited: 9d15c0b (pod restarted 21:22 UTC, cache restored from snapshot). All measurements are GET requests against http://flix.lan from the LAN, with `Accept-Encoding: gzip`, 4 samples per route, taken while at least one other person was using the system (the pod log shows a real session paging the "Not in your library yet" shelf). Code references are to `apps/server/src` unless stated.

## 1. Executive summary

1. **Warm, everything is fast and compressed**: 41 of 43 API routes answer in under 10 ms at p50, every `/api/*` body is gzip'd (5 to 7x), and every media asset is served from the disk cache in 3 to 20 ms with correct `Cache-Control` (1 year immutable on versioned URLs, 7 days otherwise).
2. **The cold paths are the problem, and they go cold far too often**: the filter dialog's facets (1.2 to 2.2 s), Categories' tag tiles (0.9 to 1.0 s) and the wanted shelf (1.3 to 4 s) are all `VOLATILE` entries sharing one 30-entry cap. Scrolling the StashDB shelf 31 pages evicts all of them (reproduced: facets went from 24 ms to 2.16 s). Since the pod started, 278 of 401 misses were caused by this eviction.
3. **The wanted shelf is the slowest thing a user meets**: page 1 costs a 41 MB Whisparr download (not 25 MB as the wiki says), re-fetched every 2 minutes and after every "Get" click, plus 24 hotlinked StashDB covers of ~280 KB each (6.7 MB per page on a phone, no resizing).
4. **A rating, O or favourite drops every cached list**: `invalidate('scene')` empties the Home rows, Browse pages, related rows, facets and tiles, so Home after rating a video is a 0.7 to 1.9 s cold build (per the wiki's own numbers). Plays already use the gentler `expire`; ratings should too.
5. **Stash change detection expired the whole cache 3 times in 14 minutes** while Whisparr was importing; each expiry re-warms Home, facets and tiles (about 20 Stash queries) and throws away every in-flight fetch.

## 2. Measurements

### 2.1 API routes (4 samples each, warm cache unless noted)

"Stash q" is the number of GraphQL queries each sample caused, read from `/api/admin/cache` before and after (Whisparr and StashDB calls are not counted by the server). Every route: `Content-Encoding: gzip`, `Vary: Accept-Encoding`, no `Cache-Control`, no `ETag`.

| Route | p50 ms | max ms | gz bytes | raw bytes | Stash q per sample | Note |
|---|---|---|---|---|---|---|
| /api/home | 41 | 49 | 29,358 | 173,785 | 0/0/0/0 | composed per request; 41 ms CPU even when warm |
| /api/scenes?perPage=24 | 5 | 5 | 3,785 | 17,431 | 0/0/0/0 | |
| /api/scenes?perPage=24&page=2 | 6 | 33 | 3,845 | 17,932 | 1/0/0/0 | first sample: stale refresh |
| /api/scenes?perPage=24&page=3 | 6 | 25 | 4,085 | 18,883 | 1/0/0/0 | |
| /api/scenes/facets | 16 | **1,170** | 8,113 | 24,604 | 1/0/0/0 | VOLATILE miss; 2,159 ms in the eviction test |
| /api/scenes/2775 | 5 | 6 | 1,525 | 3,301 | 0/0/0/0 | |
| /api/scenes/2775/related | 6 | 7 | 3,711 | 17,648 | 0/0/0/0 | |
| /api/performers?perPage=24 | 6 | 15 | 831 | 4,141 | 1/0/0/0 | |
| /api/performers/447 | 4 | 6 | 800 | 1,837 | 0/0/0/0 | |
| /api/performers/807 | 5 | 6 | 712 | 1,502 | 0/0/0/0 | |
| /api/scenes?performers=447&perPage=40 | 6 | 10 | 3,990 | 32,422 | 0/0/0/0 | the performer page's scene list (SceneBrowser) |
| /api/scenes?performers=807&perPage=40 | 7 | 10 | 4,806 | 29,855 | 0/0/0/0 | |
| /api/scenes/facets?performers=447 | 10 | 45 | 736 | 1,751 | 1/0/0/0 | |
| /api/scenes/facets?performers=807 | 6 | 66 | 785 | 2,021 | 1/0/0/0 | |
| /api/studios/6 | 5 | 6 | 268 | 437 | 0/0/0/0 | |
| /api/scenes?studios=6&perPage=40 | 7 | 8 | 4,452 | 29,166 | 0/0/0/0 | |
| /api/scenes/facets?studios=6 | 16 | **389** | 2,811 | 8,035 | 1/0/0/0 | |
| /api/tags/tiles | 19 | **998** | 21,377 | 137,619 | 1/0/0/0 | VOLATILE miss; 859 ms in the eviction test |
| /api/tags/25 | 4 | 5 | 121 | 122 | 0/0/0/0 | |
| /api/scenes?tags=25&perPage=40 | 7 | 9 | 5,785 | 29,419 | 0/0/0/0 | |
| /api/search?q=a | 6 | 7 | 1,594 | 6,732 | 4/0/0/0 | 4 queries on a miss, cached after |
| /api/search?q=blonde teen anal | 7 | 39 | 457 | 880 | 4/0/0/0 | |
| /api/whisparr/performer/447 | 10 | **1,321** | 2,346 | 8,081 | 0/0/0/0 | page 1; 3,000 to 4,000 ms in the pod log for performer 646 |
| /api/whisparr/performer/807 | 9 | 151 | 2,430 | 7,060 | 0/0/0/0 | |
| /api/whisparr/studio/6 | 10 | 155 | 304 | 399 | 0/0/0/0 | |
| /api/whisparr/new | 9 | 9 | 502 | 944 | 0/0/0/0 | |
| /api/whisparr/activity | 6 | 9 | 757 | 1,596 | 0/0/0/0 | |
| /api/history | 8 | 10 | 11,054 | 84,303 | 0/0/0/0 | 300 entries, each a full card |
| /api/playlists | 6 | 6 | 153 | 163 | 0/0/0/0 | |
| /api/settings | 6 | 7 | 204 | 265 | 0/0/0/0 | |
| /api/stats | 5 | 6 | 840 | 3,428 | 0/0/0/0 | |
| /api/duplicates | 4 | 7 | 714 | 1,666 | 0/0/0/0 | |
| /api/stations | 6 | 6 | 174 | 270 | 0/0/0/0 | |
| /api/stations/resume | 8 | 13 | 715 | 1,842 | 0/0/0/0 | runs a DELETE on every GET (`forgetAdHoc`) |
| /api/featured | 21 | 33 | 4,505 | 22,057 | 0/0/0/0 | ranks the 2.3 MB pool on every call |
| /api/features | 4 | 6 | 61 | 52 | 0/0/0/0 | |
| /api/blocklist | 5 | 6 | 51 | 40 | 0/0/0/0 | |
| /api/favorites | 6 | 7 | 57 | 41 | 0/0/0/0 | |
| /api/rows | 6 | 7 | 22 | 2 | 0/0/0/0 | |
| /api/scenes/hidden | 4 | 5 | 22 | 2 | 0/0/0/0 | |
| /api/tags?perPage=1000 | 6 | 259 | 11,202 | 66,772 | 1/0/0/0 | the filter dialog's tag list |
| /api/studios?perPage=200 | 6 | 9 | 3,536 | 22,060 | 0/0/0/0 | |
| /api/scenes?inProgress=1&perPage=1 | 4 | 5 | 451 | 808 | 0/0/0/0 | Continue badge; returns a full card for a count |

Slowest requests in the pod log over the preceding 30 minutes (real use, not my probes):

| ms | Request |
|---|---|
| 4,000 | GET /api/whisparr/performer/646?page=28 |
| 3,000 (x3) | GET /api/whisparr/performer/646?page=1 |
| 2,000 / 1,000 / 1,000 | POST /api/whisparr/get-remote/… (three "Get" clicks) |
| 1,000 | GET /api/scenes/facets |
| 981 / 500 | GET /api/tags/tiles |
| 834 | GET /api/whisparr/performer/646?page=2 |
| 562 | GET /api/whisparr/performer/447?page=1 |
| 431 | GET /api/whisparr/studio/6?page=1 |
| 383 | GET /api/scenes/facets?studios=6 |
| 170 to 270 | GET /api/whisparr/performer/646?page=N (about 35 pages, each a cold StashDB page) |

### 2.2 Eviction reproduction

Read-only: I paged `/api/whisparr/performer/646?page=2..32` (31 pages), exactly what the log shows the user doing, with `/api/admin/cache` read before and after.

| Step | entries | evictions | misses | /api/scenes/facets | /api/tags/tiles | /api/whisparr/performer/447 |
|---|---|---|---|---|---|---|
| before | 233 | 242 | 365 | 24 ms | 21 ms | 9 ms |
| after 31 StashDB pages | 233 | 274 | 397 | **2,159 ms** | **859 ms** | **220 ms** |
| second hit | 233 | 278 | 401 | 15 ms | 18 ms | 7 ms |

The entry count never moved and `maxEntries` is 5,000, so all 278 evictions since boot are the VOLATILE cap (`cache/memory.ts:52,116`), not the LRU bound.

### 2.3 Media proxy (two passes each; "Stash fetch" = asset counter delta)

| URL | ms (pass 1 / 2) | bytes | type | Cache-Control | ETag | Stash fetch |
|---|---|---|---|---|---|---|
| /scene/2775/screenshot?t=… | 7 / 5 | 166,145 | image/jpeg | private, max-age=31536000, immutable | yes (Stash's) | 0 |
| …screenshot?t=…&w=640 | 3 / 3 | 13,040 | image/webp | same | **none** | 0 |
| …screenshot?t=…&w=960 | 21 / 4 | 25,520 | image/webp | same | none | 0 |
| …screenshot?t=…&w=320 | 40 / 36 | 4,642 | image/webp | same | none | 0 |
| /scene/2775/preview | 19 / 13 | 956,352 | video/mp4 | private, max-age=604800 | none | 0 |
| /scene/…_thumbs.vtt | 3 / 4 | 6,379 | text/vtt | private, max-age=604800 | none | 0 |
| /scene/…_sprite.jpg | **285** / 9 | 530,940 | image/jpeg | private, max-age=604800 | none | **1** (first fetch from Stash) |
| /performer/447/image?t=… | 7 / 5 | 148,507 | image/jpeg | 1 year immutable | yes | 0 |
| …image?t=…&w=320 | 4 / 4 | 8,250 | image/webp | 1 year immutable | none | 0 |
| /studio/6/image?t=… | 3 / 3 | 11,545 | image/svg+xml | 1 year immutable | yes | 0 |
| …image?t=…&w=320 | 4 / 4 | 11,545 | image/svg+xml (original, SVG not resized) | 1 year immutable | yes | 0 |

Phone-size card bytes: a card asks for the 640 copy (13 KB) or 960 on a 3x screen (25 KB), an avatar 8 KB. A Home feed of about 200 cards is roughly 3 to 5 MB of images, all disk hits. This layer is in good shape.

Hotlinked StashDB cover (what the wanted shelf renders at `apps/web/src/components/WantedRow.tsx:76`): `https://stashdb.org/images/7e9a8bdb-…` = **280,662 bytes, 0.95 s** from this Mac, image/jpeg, full size. 24 per page.

### 2.4 Whisparr movie list (measured through `~/code/nas/scripts/arr.py whisparr3 get movie`)

| | |
|---|---|
| entries | 13,079 (2,582 with a file, 10,497 missing) |
| JSON bytes | **41,010,479** (the wiki and `whisparr.ts:48` say ~25 MB) |
| fetch time from this Mac | 3.96 s |
| JSON.parse on an M-series Mac | 52 ms, +53 MB heap |
| projection of only the fields flix reads | 10.1 MB |
| pod memory limit | 768 Mi (request 256 Mi) |

### 2.5 Payload shape (`/api/scenes?perPage=24`, 17,431 raw bytes, 24 cards)

| field | bytes | rendered by SceneCard? |
|---|---|---|
| performers (id, name, image x2 per card) | 4,659 | names yes; `image` no (SceneCard never shows performer avatars) |
| studio (id, name, image) | 2,193 | yes |
| screenshot | 1,169 | yes |
| vtt | 1,152 | yes (scrub) |
| title | 1,045 | yes |
| preview | 785 | yes |
| createdAt | 648 | yes (New badge) |
| date, size, durationSec, id, lastPlayedAt, width, rating, height, resumeTime, playCount, oCount | < 300 each | mostly yes; `size`, `width`, `lastPlayedAt`, `oCount` are not drawn on cards |

Verdict: payloads are reasonable once gzip'd (3.8 KB per 24 cards). The only waste is the performer `image` URLs (about 25% of the raw list) and `/api/history` carrying 300 full cards (84 KB raw, 11 KB gz).

## 3. Findings, ranked by user impact

### F1. One 30-entry VOLATILE cap is shared by cheap StashDB pages and the expensive working sets; browsing the shelf makes the filter dialog, Categories and the shelf itself cold

- **Evidence**: `cache/memory.ts:52` (`maxVolatile ?? 30`), `:112-119` (oldest VOLATILE out). Tagged VOLATILE: facets per filter set (`stash.ts:1018`), tag tiles (`:1260`), `sceneStashIdMap` (`:1326`), every Whisparr list (`whisparr.ts:69`), every StashDB page (`stashdb.ts:75`). Reproduction in 2.2: 31 pages → 32 evictions → facets 2,159 ms, tiles 859 ms. Pod log: `/api/scenes/facets` 1,000 ms and `/api/tags/tiles` 981 ms during the user's shelf session. 278 of 401 misses since boot.
- **Why the user feels it**: after scrolling a long shelf (or several performers' shelves), opening Filters spins for 1 to 2 s, Categories for 1 s, and the next performer page's shelf re-downloads 41 MB.
- **Proposed change**: (a) give each family its own cap: pass a `caps` map to `MemoryCache` keyed by a prefix tag (`volatile:stashdb` 60, `volatile:facets` 20, `volatile:whisparr` 5) or, simpler, exempt a `PINNED` tag from the volatile sweep and put it on `whisparr:movies`, the unfiltered facets and tiles working set, and `sceneStashIdMap`. (b) StashDB pages are 8 KB each: drop VOLATILE from `stashdb.ts:75` so they go to the snapshot and stop competing (37 pages is 300 KB). (c) Cache the **computed** facets and tiles (8 KB and 21 KB gz) under non-volatile keys, keep only the raw working set volatile; see F6.
- **Effort**: S. **Confidence**: high (reproduced).

### F2. The wanted shelf downloads 41 MB from Whisparr every 2 minutes and after every "Get"

- **Evidence**: `whisparr.ts:48` `LIST_TTL = 2 min`, `:71` `movies()` = `GET /api/v3/movie` (41 MB, 13,079 entries, 2.4). `wanted()` at `:174` awaits it on every page request. `getScene`/`getRemote` call `dataCache.invalidate('whisparr')` at `:237,278`, which drops the list, so the next page waits for the whole download. Pod log: page 1 took 3,000 ms three times and page 28 4,000 ms right after three POST get-remote calls; my cold sample 1,321 ms.
- **Why the user feels it**: the first shelf after a Get click, after 2 idle minutes, or after F1's eviction, is a 1.3 to 4 s spinner; while the 41 MB is parsed the event loop stalls for every other request (52 ms on an M-series Mac, likely 150 to 300 ms on the N100-class node).
- **Proposed change**: (a) store a **projection**, not the raw list: map each movie to the 15 fields `toWanted`, `movieForFile`, `placementFor` read (10 MB, and far fewer objects) inside the `cached()` loader so the cache never holds the 41 MB array. (b) Raise `LIST_TTL` to 15 min: flix's own writes already invalidate it, and Whisparr's additions are what the `activity` queries (30 s TTL) already surface. (c) In `getScene`/`getRemote`, patch the cached projection (`monitored: true`, or push the added movie) and invalidate only `queue`/`grabbed` instead of the whole `'whisparr'` tag. (d) Longer term, ask Whisparr for less: `/api/v3/wanted/missing` exists (2,855 records, paged) but only lists monitored items, so it cannot replace the list under the "nothing monitored" policy; check whether Whisparr v3 filters `/movie` by `performerId` or `studioId` (nas repo, `arr.py`) before relying on it.
- **Effort**: M. **Confidence**: high on cost (measured), medium on (d).

### F3. StashDB covers are hotlinked full size: 24 x 280 KB per shelf page, no resize, no cache

- **Evidence**: `stashdb.ts:106,117` picks the **widest** image URL; `WantedRow.tsx:76` renders it directly. One cover = 280,662 bytes, 0.95 s (2.3). Pod log shows 37 pages viewed, which is ~250 MB of covers for one performer.
- **Why the user feels it**: on a phone the shelf's images trickle in over seconds, and each "Show more" page costs 6.7 MB of mobile-size bandwidth; the Stash-side cards next to them are 13 KB each.
- **Proposed change**: a `/media/remote/<id>?w=640` route in `media.ts` that resolves `<id>` to the StashDB URL (map built when `toRemote` runs, or encode the URL with an HMAC like `signing.ts`), fetches it through `AssetCache.serveResized` with an upstream allowlist of `stashdb.org`, and the same 7-day `Cache-Control`. `toRemote` returns the proxied URL. This keeps rule 1's spirit (the browser talks only to flix) and makes the covers 15 to 25 KB WebP. Alternatively, pick the **smallest** image ≥ 640 px rather than the widest (`stashdb.ts:106`), effort S, if StashDB offers several sizes.
- **Effort**: M (proxy) or S (pick smaller). **Confidence**: high.

### F4. Rating, O, hiding, editing or favouriting drops every cached list; Home then rebuilds cold

- **Evidence**: `updateSceneRating` `stash.ts:661`, `addSceneO` `:679`, `updateScene` `:831` and `setPerformerFavorite` `:733` call `mutate(..., ['scene'])`, and `MemoryCache.invalidate` (`memory.ts:122-131`) deletes every entry carrying the tag: all Home rows, Browse pages, related rows, search, history, the facets and tiles working sets, and `sceneStashIdMap`. Plays and progress saves (`:667,675`) were deliberately changed to `expire` on 2026-10-27 for this exact reason (wiki `caching.md`). Cold Home is 0.7 to 1.9 s and about 20 Stash queries (wiki measurement); the facets rebuild alone is 1.2 to 2.2 s (2.1).
- **Why the user feels it**: rate a video on its page, tap Home: the feed paints from the browser's persisted copy but every row refetches and the "Featured", "For you", facets and Categories all go cold at once; on Browse the next filter change spins.
- **Proposed change**: make these writes `mutate(q, v, [`scene:${id}`], ['scene'])` like plays (drop the one scene, mark lists stale so they are served once more while refreshing). Lists sorted by rating lag one refresh, which the web already hides by patching cards optimistically (`lib/api/scenes.ts patchScene`). `setPerformerFavorite` should invalidate `performer:<id>` and expire `scene` (favourite drives the "New from your favourites" row, which can refresh in the background).
- **Effort**: S. **Confidence**: high (code), medium on acceptability of one stale refresh for rating-sorted lists (a decision for the user).

### F5. Stash change detection expires everything and re-warms on every tick while Whisparr imports

- **Evidence**: `stash.ts:183-187`: any fingerprint change → `dataCache.expire()` (every entry stale, every in-flight fetch dropped at `memory.ts:100-102`) → `changeListeners` → `warm()` in `index.ts:137-144` (Home rows + facets + tiles ≈ 20 Stash queries). Pod log: 3 changes in 14 minutes (21:23:32, 21:35:32, 21:36:32) while the user was clicking Get, which makes Whisparr import and Stash scan. During a long scan the fingerprint changes every poll, so the warm repeats every 60 s against a Stash whose database is locked, and each `expire()` discards whatever the previous warm still had in flight.
- **Why the user feels it**: pages served stale then refreshed (fine), but during a scan every first visit to a page triggers a refetch against a locked Stash, and the warm competes with the user's own requests.
- **Proposed change**: debounce: in `checkForChanges` keep a `changedAt`; run `expire()` at once but call the listeners (the warm) only when the fingerprint has been stable for 2 consecutive polls, or at most once per 5 minutes. Also pass a tag to `mark()` for change-detected expiries so that in-flight fetches are **not** dropped (they are at worst one minute stale, and `changedSince` already prevents storing them): drop the `inflight` sweep when `tags.length === 0` comes from `expire()` rather than `clear()`.
- **Effort**: S. **Confidence**: high on mechanism, medium on frequency (3 events observed in one 14-minute window; the earlier log is gone with the restart).

### F6. Facets and tag tiles cache the raw working set, not the answer; the answer is recomputed per request and never survives a restart

- **Evidence**: `sceneFacets` (`stash.ts:1010-1044`) caches a per-filter-set scene dump (hundreds of KB, VOLATILE) and tallies on every call (16 to 24 ms warm, p50 in 2.1). `tagTiles` (`:1255-1275`) caches a 3,000-scene dump (VOLATILE) and recomputes tiles each call (19 ms warm); the result is 21 KB gz. Neither is in `data.json`, so every deploy restarts them cold (the boot warm at `index.ts:137` covers the unfiltered facets and tiles only after 1 to 2 s).
- **Why the user feels it**: after every deploy (every push to main) and every F1 eviction, Filters and Categories take 1 to 2 s.
- **Proposed change**: wrap each in a second `dataCache.get` keyed `facets:<filter json>` / `tiles` with tags `['scene','activity:play','activity:resume']` (no VOLATILE) holding the computed `SceneFacets`/`TagTile[]`; keep the raw dump as the inner volatile entry. Results are 2 to 25 KB each and snapshot fine.
- **Effort**: S. **Confidence**: high.

### F7. `/api/home` costs 41 ms of CPU on every warm request because the feed is assembled per call

- **Evidence**: 2.1: p50 41 ms with 0 Stash queries; `/api/featured` alone 21 ms (ranks the 2.3 MB pool via `rankFeatured` at `api.ts:146-160` for every call). `homeRows` (`api.ts:186`) rebuilds the 10 to 12 rows from cached pieces each time.
- **Why the user feels it**: barely on its own; it matters because Home is also refetched on every foreground return and after every invalidation, and 41 ms of single-threaded CPU on the small node delays concurrent image requests.
- **Proposed change**: cache the finished `HomeRow[]` per `visitSeed` in `dataCache` with tags `['scene','activity:play','activity:resume','performer','studio', POOL]` and a short TTL (5 min), so the common refetch is a Map lookup.
- **Effort**: S. **Confidence**: medium (the 41 ms is measured; the share attributable to ranking vs. JSON serialising of 174 KB is not split).

### F8. Resized images carry no ETag; previews and sprites expire after 7 days with no validator

- **Evidence**: 2.3: every `?w=` WebP and the preview/sprite/VTT responses have no `ETag` (`cache/assets.ts:217` stores `etag: null` for resized copies; Stash sends none for generated clips). `Cache-Control: private, max-age=604800` on the un-versioned ones.
- **Why the user feels it**: nothing for versioned URLs (1 year immutable). For previews (956 KB) and sprites (531 KB), a browser that has held one longer than 7 days re-downloads it in full instead of getting a 304.
- **Proposed change**: in `AssetCache.commit`, set `etag` to a weak hash of `size + fetchedAt` (or the sha of the key plus size) when upstream gave none; `send()` already answers 304 on `If-None-Match`.
- **Effort**: S. **Confidence**: high.

### F9. Minor payload and query shape

- `SceneCard.performers[].image` is never rendered by `SceneCard.tsx` (2.5): about 25% of raw list bytes, 5% after gzip. Drop `image_path` from the card's `performers { … }` in `SCENE_CARD` (`stash.ts:233`) if no other card consumer needs it (Scene page uses `Avatar` with it, so keep it in `SCENE_DETAIL`).
- `/api/scenes?inProgress=1&perPage=1` for the Continue badge and `useSceneCount` return a full card to read `total`; a `count=1` flag that skips `scenes { … }` would make these 50-byte answers. Effort S, impact small.
- `/api/stations/resume` deletes ad hoc rows on every GET (`stations.ts forgetAdHoc`); a one-time migration would remove a write from a read path. Effort S.
- `/api/history` ships 300 full cards (84 KB raw) when the page shows far fewer at once. Paginate (`limit`, `before`) if the History page ever feels slow; today it is 8 ms and 11 KB gz, so this is low priority.
- The asset index is rebuilt at boot by `readdir` + `stat` of 18,189 files (`cache/assets.ts:82-95`) and every asset request awaits it (`:113`). Not measured (no log line); the first `/media` request after a deploy likely waits a few seconds on the PVC. Add a `console.log` with the duration, and consider persisting the index next to `data.json`.

## 4. Quick wins (under an hour each)

1. **Soften rating/O/edit/favourite invalidation** (F4): change four `mutate(...)` calls in `stash.ts:661,679,733,831` to `[`scene:${id}`]` + `expires ['scene']` (`setPerformerFavorite`: `['performer:'+id]` + expire `['performer','scene']`). Verify with `node scripts/check.mjs` and the existing `stash.test.ts` tag assertions.
2. **Un-VOLATILE the StashDB pages and pin the Whisparr list** (F1): remove `VOLATILE` from `stashdb.ts:75`; add a `maxVolatile` of 60 in `stash.ts` `new MemoryCache({...})` as a stopgap until per-family caps exist.
3. **Fix the Whisparr list comment and TTL** (F2b): `whisparr.ts:48` says ~25 MB, it is 41 MB; set `LIST_TTL` to 15 min. Update `wiki/architecture/caching.md` ("hundreds of KB" → the list is 41 MB) and `wiki/integrations/` for Whisparr.
4. **Debounce the re-warm after a Stash change** (F5): one `stableFor` counter in `checkForChanges`.
5. **ETag for resized and generated assets** (F8): one line in `AssetCache.commit`.
6. **Pick a smaller StashDB cover** (F3 cheap variant): in `stashdb.ts:106` prefer the smallest image with `width >= 640` and fall back to the widest; measure one cover before and after.

## 5. Open questions

1. Does Whisparr v3 offer a filtered movie list (`/api/v3/movie?performerId=` or a StashDB-id filter beyond `?stashId=`)? If so F2 collapses to one small request per shelf. Check with `~/code/nas/scripts/arr.py whisparr3 get ...` (read-only); note that `wanted/missing` returned 2,855 monitored records, so it does not cover the unmonitored 10,497.
2. Is one stale refresh of rating-sorted lists after a rating acceptable to the user (F4)? It is a behaviour change worth a `decisions/` page.
3. How long does `AssetCache.load()` take on the 20 Gi PVC with 18k files, and does the first screenshot after a deploy wait on it? Needs a timing log line.
4. How often does the Stash fingerprint change during a long scan or Identify run, and how many Stash queries does the repeated warm cost? The pod log only reaches back to the last deploy; the `upstream.queries` counter in `/api/admin/cache` could be sampled across a scan.
5. Who else was hitting production during this audit: the concurrent traffic (another auditor paging `/api/whisparr/performer/646`, 170 `/api/admin/cache` polls of my own) inflated the eviction counters and may have added noise to max values, though the p50s were stable.

## Scripts worth keeping

- `(scratch)/audit/server/time-routes.sh`: times a list of GET routes N times with the browser's `Accept-Encoding`, recording ms, gz and raw bytes, `Content-Encoding`, `Cache-Control`, `ETag`, HTTP status and the per-sample delta of Stash queries and asset fetches from `/api/admin/cache`. Output is TSV. Candidate for `scripts/` as `api-latency.mjs` (read-only; tags `perf, verify`), with the summariser (`python3` block in this session) folded in. Routes list: `routes.txt` beside it.
- `(scratch)/audit/server/media-probe.sh`: two passes per media URL, printing status, ms, bytes, type, `Cache-Control`, `ETag`, `Content-Length` and whether the BFF went to Stash. Candidate for `scripts/` as `media-probe.mjs`.
- Raw data in the same directory: `routes.tsv`, `media.tsv`, `scene2775.json`, `perf447.json`, `studio6.json`, `scenes24.json`, `wanted447.json`, `whisparr-movies.json` (41 MB, delete after use).

## Wiki corrections for the lead (I made no repo edits)

- `wiki/architecture/caching.md` and `apps/server/src/whisparr.ts:48`: the Whisparr list is 41 MB / 13,079 entries (2026-10-31), not ~25 MB.
- `wiki/architecture/caching.md` Layers table: note that the VOLATILE cap (30) is shared by facets, tiles, `sceneStashIdMap`, Whisparr lists and every StashDB page, and that eviction, not the LRU bound, is the dominant cause of misses in production (278 of 401 since the 21:22 UTC restart).
