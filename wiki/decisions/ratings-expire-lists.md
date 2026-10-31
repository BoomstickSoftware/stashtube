---
title: Ratings expire lists instead of dropping them
kind: decision
summary: A rating, O, edit or performer favourite drops only its own entity and marks cached lists stale, so a list sorted by rating may lag one refresh.
tags: [caching, ratings, performance, server]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [caching, stash-layer, stash-owns-activity]
---

# Ratings expire lists instead of dropping them

**Decided** 2026-10-31 by the user (decision 1 of the UX audit roadmap). **Status** current.

## Context

`updateSceneRating`, `addSceneO`, `updateScene` and `setPerformerFavorite` dropped every cached
`scene` query (`invalidate('scene')`): Home rows, Browse pages, related rows, search, history,
the facets and tag-tile working sets. Rating a video and tapping Home meant a cold rebuild of
0.7–1.9 s and ~20 Stash queries (audit finding F4, `docs/audits/2026-10-31-ux/server.md`).
Plays had been moved to `expire` on 2026-10-27 for the same reason. The one cost of doing the
same for ratings: a list sorted or filtered by rating is served once from before the write.

## Decision

A rating, an O, a title or tag edit and a performer favourite drop only `scene:<id>` (or
`performer:<id>`) and `expire` the broad tags (`scene`; `tag` for a tag edit; `performer` and
`scene` for a favourite). Lists sorted by rating may lag one refresh.

## Consequences

- The web keeps hiding the lag by patching the card in place (`patchScene` in
  `apps/web/src/lib/api/scenes.ts`), so the star the user tapped is right at once.
- The scene page itself is always fresh: its own `scene:<id>` entry is dropped.
- Deletes, Identify and `destroyScene` still drop whole families; they change what exists, not
  one field ([[caching]]).

## Revisit if

A rating-sorted list is seen out of order often enough to notice, or lists gain a rating
filter the user drives interactively (then `activityTags()`-style tags for `rating100` would
drop only the lists that read it).
