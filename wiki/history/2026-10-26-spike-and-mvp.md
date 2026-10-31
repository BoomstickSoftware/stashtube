---
title: "2026-10-26: Spike and MVP"
kind: history
summary: The one-day spike against Stash v0.31.1 that settled the architecture, and the MVP that followed the same day: home feed, browse, search, player, people pages, playlists, blocklist.
tags: [history, mvp, spike, stash]
date: 2026-10-26
commits: [5c69fa6]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [stash-stays-headless, overview, 2026-10-26-caching-and-ux-round-1]
---

# 2026-10-26: Spike and MVP

## What changed

- **Decision**: neither fork Stash nor rewrite it; keep it headless on the NAS and build a
  front end plus a small BFF ([[stash-stays-headless]], [[overview]]).
- **Spike results** against Stash v0.31.1, now recorded in [[stash-api]]: nested `AND`
  exclusions are fast (~0.2 s); `random_<seed>` sort pages stably; `screenshot`, `preview`
  (mp4), `vtt` + `sprite` exist but animated `webp` 404s; assets come with `no-cache`; the
  direct stream honours `Range`; HLS playlists use root-relative segment paths and work with
  the `ApiKey` header alone; `/graphql` answers CORS `*`; `sceneUpdate`, `sceneAddPlay`,
  `sceneSaveActivity`, `sceneAddO`, `performerUpdate` and `studioUpdate` are available.
- **MVP** (5c69fa6), running locally by evening: [[home-feed]] (continue, favourites, recent,
  discover, top rated, releases, most watched), [[browse-and-filters]] with sort, quick
  filters, tag include/exclude and infinite scroll, typeahead [[search]], [[scene-page]] with a
  custom [[player]] (sprite seek thumbnails, resume, play counting, keyboard, theater,
  autoplay next), [[related-videos]], [[people-pages]] with follow, rating and block,
  [[playlists-and-favorites]] (ordered, drag reorder, play all, shuffle), the blocklist in
  Settings ([[blocklist-and-exclusions]]), [[optional-login]].
- Library mix measured: 477 of 520 files mp4/h264/aac; 43 need a transcode ([[player]]).

## How it was verified

Hand use in a browser against the real Stash; the first HLS segment of a VC-1 WMV took ~2.3 s.

## Snags

- Stash's SQLite locks during scans; retries and stale serving came the same day
  ([[stash-database-locked]]).
- A CI hang on the first image build was the runner's DNS, not pnpm's store (e73b2f5
  reverted by 85b82e8).
