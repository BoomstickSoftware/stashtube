---
title: "2026-10-31: The hero keeps going past the Featured row"
kind: history
summary: The Home hero looped over the first 8 Featured picks; it now walks the whole row and fetches the same ranking further down, twenty at a time, through a new offset on /api/featured.
tags: [home, featured, hero, ux]
status: record
date: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
related: [home-feed, featured-ranking, 2026-10-31-ux-audit]
---

# 2026-10-31: The hero keeps going past the Featured row

## What changed

The user noticed the hero "loops after 5–6 videos" (it cycled `HERO_PICKS = 8`). Now:

- `GET /api/featured` takes `offset` (≤ 5000): `rankFeatured` runs with `limit + offset` and
  the result is sliced, so pages continue the same seeded ranking ([[featured-ranking]]).
- `useMoreFeatured(seed, from, enabled)` in `lib/api/home.ts`: an infinite query keyed by
  seed, `HERO_PAGE = 20` per page, enabled once the hero is within four picks of the row's end.
- `Hero` owns the picks: the Featured row (24), then the fetched pages deduplicated against
  it; it asks for the next page when within four of its end and wraps around only when
  `hasNextPage` is false ([[home-feed]]).

## How it was verified

`node scripts/check.mjs` clean. Headless (`mobile-check` with an `EVAL` that clicks the next
arrow 30 times): the hero showed more than 24 distinct titles and the page requested
`/api/featured?...&offset=24` onwards. Against production (which did not yet know `offset`)
every page came back as duplicates of the row and the hero kept asking for the next page: a
page that adds nothing new now ends the paging.

## Snags

None; the server already ranked the whole pool per call, so a deeper `limit` costs nothing.
