---
title: Home feed
kind: feature
summary: The rows the Home page shows, in order, where each comes from, and how the feed is seeded, warmed and persisted so a cold open paints at once.
tags: [home, rows, recommendations, caching]
status: current
verified: 2026-10-31
updated: 2026-10-31
routes: [/]
api: [GET /api/home?seed=, GET /api/rows, POST /api/rows, PUT /api/rows/order, PUT /api/rows/:id, DELETE /api/rows/:id]
code: [apps/server/src/api.ts, apps/server/src/rows.ts, apps/server/src/stash.ts, apps/web/src/pages/Home.tsx, apps/web/src/lib/api/home.ts]
related: [featured-ranking, caching, whisparr-shelf, stations, related-videos, blocklist-and-exclusions]
---

# Home feed

Home is one request, `GET /api/home?seed=`, answered from the query cache and built in the
background at boot and after every Stash change, so the first visit is warm. The **finished rows
are cached per visit seed** (`home-rows`, 5 min, then served stale while they rebuild, snapshotted
across deploys; since 2026-10-31, _before, the rows were assembled from their cached pieces on
every call, 41 ms_): a pinned-row, Settings or blocklist write drops them, a play or an edit
leaves them stale like any list, and the rebuild waits for fresh pieces ([[caching]]). The
browser keeps the last answer in localStorage (`flix.queries`) and paints it at once on a cold
open, then refetches, which the weak ETag turns into a 304 when nothing moved.

## Behaviour

Rows, in the order `homeRows()` assembles them (a row needs 3 items to show; pinned rows always
show, even empty, so they can be managed); the web slots "Pick up a station" in after Featured:

| Row | Source |
|---|---|
| Hero carousel + **Featured** | the top of [[featured-ranking]]; the hero walks the whole Featured row (24) in score order, then fetches the same ranking further down twenty at a time as it nears the end (`GET /api/featured?seed&limit=20&offset=`), wrapping only when the ranking runs out (_until 2026-10-31 it looped over the first 8_); advances every 12 s, arrows and swipe; a slight drag previews on touch |
| **For you** | `recommendations()`: watch, rating and O affinity, tags weighted by rarity; unwatched |
| **Because you watched …** | [[related-videos]] of the last played scene, unwatched first, up to 24 |
| Pinned rows | Browse filters saved as rows (`saved_rows` table): rename, reorder, unpin |
| **More with <performer>** | one row per favourite performer, random with the day's seed |
| **New from performers you follow** | favourite (followed) performers, newest first; _titled "New from your favourites" until 2026-10-31_ ([[categories-and-us-spelling]]) |
| Recently added, Discover (random, unwatched), Top rated (★4+), Latest releases, Most watched | plain filtered lists |
| **New from your favourites, not downloaded** | Whisparr's recent releases from favourite performers, from 3 items; see [[whisparr-shelf]] |
| **Pick up a station** | stations and playlists with a saved spot, from `/api/stations/resume`; see [[stations]]. Rendered **right after Featured** (since 2026-10-31; _the first row under the hero before_, which put Featured below the fold at 1440×900), or first when there is no Featured row |

Continue watching is no longer a row: it has its own nav item ([[continue-history-stats]]).
The blocklist and the Settings people defaults apply to every row ([[blocklist-and-exclusions]]);
the Performers page's Women / Men / Everyone switch does not (_it steered "For you" and "More
with" until 2026-10-31_, [[gender-switch-performers-page-only]]).

## Seeds

Random rows use `daySeed()` (the day number), so they are stable through a day. Featured takes
the browser's seed: `homeSeed()` in `lib/api/home.ts` keeps one in localStorage `flix.homeSeed`
for 6 hours, so returning to Home or a cold open finds its feed already cached (painted at once,
at the same scroll position); Shuffle on the Featured row rolls a new one, and after 6 hours it
rolls by itself, with the newest cached feed standing in until the new one arrives. A request
without a seed (the warm, curl) gets the day's. _Until 2026-10-31_ every visit made a new seed,
so the cached feed was never used and Back to Home lost its place.

The BFF builds the rows' groups at once (Featured, For you, Because you watched, pinned rows,
the fixed rows); only "More with" waits for the recommendations. A cold feed (query cache
cleared) took 2.7–3.4 s, 2.5–2.9 s with the rows in parallel, 1.3–1.6 s once the Featured
pool was slimmed and 1.0–1.2 s once the activity query stopped counting tags (2026-10-31,
[[featured-ranking]]); the rest is the pool's 0.8 s, which the snapshot keeps across restarts.
With the pool cached, Featured for a new seed answers in 0.04 s.

## Where

- Server: `homeRows()` in `api.ts`; pinned rows in `rows.ts`; recommendations and
  `becauseYouWatched` lean on `stash.ts`.
- Web: `pages/Home.tsx`, hooks in `lib/api/home.ts`; the persisted keys are listed in
  `PERSISTED` in `lib/api/client.ts` ([[caching]]).

## Limits and numbers

- Cold `/api/home` cost Stash 7 queries and 79 asset fetches on 2026-10-26; warm, nothing.
- Cold 0.7–1.9 s, warm 4–8 ms, after a restart 10 ms from the restored cache (2026-10-27).
- The home body is 108 KB → 17 KB gzip'd (2026-10-29).

## Rendering cost (2026-10-31)

Home holds ~260 cards. Each `Row` section and each card is `content-visibility: auto` with an
intrinsic size, so rows below the fold are laid out and painted only when they come near;
`Row` and `SceneCard` are memoised; the hero owns its own index so its 12 s tick re-renders
only itself. "Pick up a station" arrives after the feed: while it loads the section holds its
height, so the rows below do not jump (decision [[home-rows-stay-24-render-lazily]]).
