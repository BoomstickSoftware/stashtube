---
title: Featured ranking
kind: feature
summary: How the Featured row and Tonight's pick are scored from ten signals and user-set weights, where the weights live, and how to add a signal.
tags: [home, ranking, settings, recommendations]
status: current
verified: 2026-10-31
updated: 2026-11-09
routes: [/, /settings]
api: [GET /api/featured, POST /api/featured/preview]
code: [apps/server/src/featured.ts, apps/server/src/featured.test.ts, apps/server/src/stash.ts, packages/shared/src/index.ts, apps/web/src/components/FeaturedDials.tsx]
related: [home-feed, settings-next-to-page, single-user-no-login]
---

# Featured ranking

The Home page's first row and the hero above it are the whole library ranked by one pure
scoring pass, `featured.ts`, with dials the user sets on Settings → Featured. It replaced a
hard-coded sort on 2026-10-30 at the user's request.

## Behaviour

- **Pool**: `featuredPool()` in `stash.ts`, every scene minus exclusions, one cached VOLATILE
  query carrying only the scoring fields (ids, dates, counts, rating, markers, favourite flags);
  the winners' cards come from `findScenesByIds`. Full card fields for the whole library took
  2.3 s and ~7 MB, the slim query 0.8 s and 2.3 MB (2026-10-31). It is tagged `featured-pool`,
  not `scene`: a play or an edit marks it stale (served at once, refreshed behind), so Home
  after watching does not wait for it, and it is not VOLATILE, so it goes into the snapshot and a
  restart starts with it (the snapshot grew from 0.9 to 3.3 MB) ([[caching]]).
- Tag affinity weights rare tags by `log(1 + scenes / tag's scenes)`; the tag sizes come from
  one cached `findTags` (0.14 s for ~1,100 tags), not from `tags { scene_count }` inside the
  activity query, where Stash counted every tag again for each scene (0.5 of its 0.6 s).
- **Ten signals**, each rank-normalised 0..1 over the pool: dormant (long since last played;
  never played counts from added), shelfAge (long since added), fresh (newly added), performer,
  tag, studio (favourites and what you watch, from `affinities()`, shared with For-you),
  watched (play count), marked (marker count), rated, oCount.
- **Score** = Σ signal × weight (−1..1) + `surprise` × `hash01(id:seed)`. `surprise` 0 makes
  the order deterministic.
- **Defaults** (`FEATURED_DEFAULTS` in `@flix/shared`): dormant 0.4, shelfAge 0.2,
  performer 0.5, tag 0.3, rated 0.3, watched −0.2, surprise 0.3, the rest 0.
- **Caps**: at most two picks per performer and three per studio. Every pick carries a `why`
  line in words ("A performer you follow · not seen in 7 months"; _"Favourite performer" until
  2026-10-31_, [[categories-and-us-spelling]]).
- **Seed**: the browser's, kept 1 hour (`homeSeed()`, [[home-feed]]; Shuffle draws another);
  without one, the day's. With `surprise` 0.7 a new seed changes nearly the whole row.
- **Weights** are saved under the `featured` key of the `settings` table, so they are shared
  across devices ([[single-user-no-login]]). Settings previews the top 12 live while dragging
  through `POST /api/featured/preview` with unsaved weights.

## Adding a signal

Add it to `FeaturedWeights` (shared) and `SIGNALS`, its raw value in `rawSignals`, its words in
`phrase`, and a dial in `FeaturedDials.tsx`. `featured.test.ts` covers the ranker.

## Where

Server `featured.ts` (pure; pool and affinities from `stash.ts`); web `FeaturedDials.tsx`,
the row in `pages/Home.tsx` ([[home-feed]]). The runtime image must ship `packages/shared/src`
because the server imports the defaults as a value ([[shared-contract]]).

## Paging the ranking

`GET /api/featured?seed=<s>&limit=<n>&offset=<o>` (since 2026-10-31) returns ranks `o..o+n` of the
same ranking for that seed, so the Home hero can keep going past the row ([[home-feed]]).
`limit` ≤ 60, `offset` ≤ 5000. The ranking is cached (`featuredRanking` in `api.ts`, since
2026-11-09): the first 100 ids with their "why" per seed, dials and exclusions (200, 300, … as
the hero pages further), tagged `featured-pool` so any write that moves a score expires it, kept
stale 2 h. The candidates are built once per fetched pool (`memoBy`). _Until 2026-11-09_ every
call re-ranked the whole pool and rebuilt every candidate's card: 31–39 ms, the slowest warm
route, on every hero page and every Settings slider move.
