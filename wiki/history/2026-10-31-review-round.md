---
title: "2026-10-31: Review round (images, guard, state, cache, data quality)"
kind: history
summary: Eight initiatives from a three-way review, from resized thumbnails and a request guard to state that survives navigation, cache and data-quality fixes and instant scene opens.
tags: [history, performance, security, ux, data-quality]
date: 2026-10-31
commits: [5f9a65a, 806d6b1, 28e9a56, da647d0, 8652af0, 515e45d, 055179e, 8373e76]
status: record
verified: 2026-10-31
updated: 2026-10-31
related: [media-proxy, request-guard, home-feed, caching, blocklist-and-exclusions, continue-history-stats, playlists-and-favorites, scene-page, related-videos]
---

# 2026-10-31: Review round

The user asked for 5–10 improvements chosen and built autonomously. Three read-only reviews
(server, web, security and data quality) plus a look at the live app at phone size produced
the list; each initiative was one verified, pushed commit.

## What changed

1. **Resized thumbnails** (5f9a65a): `?w=320|640|960` WebP copies made with sharp and cached;
   cards use `srcset`; the nightly warm makes them. 382 KB → 29 KB at 640 → [[media-proxy]].
2. **Request guard** (806d6b1): cross-site writes 403, foreign host names 421, nosniff,
   no-referrer, no framing, local-only playback CORS → [[request-guard]].
3. **State that survives** (28e9a56): Home's seed kept 6 h so its cached feed paints and Back
   keeps the scroll; rating/O edits reach Home rows; Try again on every error; refetch on
   return to the foreground; lists kept 30 min → [[home-feed]], [[web-app]].
4. **Cache correctness** (da647d0): in-flight reads survive unrelated writes; asset fetches
   time out at 60 s, body included; exclusions' lookups in parallel and `firstSceneYear` off the
   `scene` tag; volatile entries capped at 30; home rows built in parallel → [[caching]].
5. **Data quality** (8652af0): blocklist on History, Stats, Because you watched and station
   resume; `unblocked=0` honoured; reversed age range and stray intro keys refused; no resume
   point before 30 s or past 95% → [[blocklist-and-exclusions]], [[continue-history-stats]].
6. **Ghost sweep** (515e45d): rows for scenes deleted outside flix removed, with a refuse-if-
   most-are-gone guard → [[playlists-and-favorites]].
7. **Scene opens** (055179e): scene fetched on touch, the cached card shown while it loads;
   removed previews stop downloading; a scroll no longer opens a card's menu → [[scene-page]].
8. **Related never empty** (8373e76): topped up from the studio's or uploader's folder, then
   unwatched → [[related-videos]].

## How it was verified

- Server suites 69 → 80 tests (resize, guard, in-flight rules, volatile cap, `isBlocked`,
  `groupFolder`); web `tsc -b` and lint (no new warnings) each time; every image built locally,
  and Trivy run locally on the one that added sharp (no HIGH/CRITICAL).
- Resizing end to end on a local server reading assets through production's proxy; the guard
  on a local server and then in production; the sweep against the dev Postgres with a fake
  Stash (removes the one missing scene, refuses when Stash claims most are gone, user rows
  intact); Home cold open and Back, scene open timing and the card gestures in headless Chrome
  against production data (writes blocked); the folder regex with a read-only Stash query.

## Snags

- Stash's `INCLUDES` on a path matched 2,496 of 2,502 scenes; `MATCHES_REGEX` on the escaped
  folder is what works ([[related-videos]]).
- Parallel home rows gained little (2.7–3.4 s → 2.5–2.9 s cold): the Featured pool's
  whole-library query dominates. The first measurements after a deploy (8 s) were the new pod
  warming up, not a regression.
- The admin cache clear needs `{"scope":"data"}`; `all` would also empty the asset cache.
- zsh does not split `$FILES` for `git commit -- $FILES`; `--pathspec-from-file` does.
