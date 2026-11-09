---
title: "2026-11-09: Strategy review of features, navigation and server load"
kind: history
summary: A read-only review of what flix surfaces and where, plus a server performance audit; the gaps found, the user's decisions, and the initiatives A–G it put on the roadmap.
tags: [history, ux, performance, navigation, roadmap]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [roadmap, continue-clears-and-expires, hide-means-delete-block-or-unlist, five-tab-navigation, 2026-11-09-cache-tags-round, 2026-10-31-ux-audit]
---

# 2026-11-09: Strategy review of features, navigation and server load

## What was found

- **Continue only grows**: 79 videos on 2026-11-09 (36 after the 2026-10-31 hand cleanup);
  11 past 90%, 19 under 10%, 38 untouched for 7–30 days; nothing in flix removed one. Measured
  with `GET /api/scenes?inProgress=1&sort=last_played_at` against production.
- **Three overlapping ways to hide** (Block, Not interested, Unlist), each named and undone in a
  different place, plus Discreet and Private in the header.
- **Phone navigation**: 7 tabs and up to 8 header icons; Stations, Discover and the Vault only
  as unlabelled icons. The scene page's action row wraps to 2–3 lines on the phone.
- **History**: a `window.confirm` remove with no Undo; 300 entries each with a full card,
  repeated per play.
- **Server** (code read by an agent; items 1 and 2 checked by hand):
  1. every progress save deleted Home and the facets (`activity:*` tags);
  2. the Whisparr guard re-downloads `/movie` (41 MB) every 15 min all day, sync on or off;
  3. the Cast sync's bulk writes dropped every `scene` query and set off a second warm;
  4. `sceneStashIdMap` refetched the whole library after every play;
  5. `/api/featured` re-ranks the whole pool on every call (31–39 ms);
  6. category tiles read only the top 3,000 scenes;
  7. the cache snapshot was rewritten every 2 min of playback;
  8. `sdb_queries` is never pruned.

## Decisions

[[continue-clears-and-expires]], [[hide-means-delete-block-or-unlist]], [[five-tab-navigation]];
the plan is in [[roadmap]] (initiatives A–G).

## Snags

- `scripts/stash.py` could not run: `STASH_URL` and `STASH_API_KEY` are not in flix's `.env`
  yet (roadmap, Stash and Whisparr operations); the Continue numbers came from flix's own API.
