---
title: "2026-10-26: BFF caching and UX round 1"
kind: history
summary: Phases 2b and 2c: the query cache with change detection, the disk asset cache and admin stats, then the first UX round (AirPlay, Favorites playlist, hero carousel, pinned rows, affinity rows, markers, panic key).
tags: [history, caching, ux]
date: 2026-10-26
commits: [5face11, 25fd7e1]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [caching, 2026-10-26-spike-and-mvp, 2026-10-27-mobile-and-speed-round]
---

# 2026-10-26: BFF caching and UX round 1

## What changed

**2b, caching** ([[caching]]): a query cache with Stash change detection, a disk asset cache,
and Settings → Cache with hit rates and clear buttons ([[cache-admin]]). Measured that day: a
cold home view cost Stash 7 queries and 79 asset fetches; a warm view cost nothing.

**2c, UX round 1:**
- Videos and performers: AirPlay with signed per-scene playback links that need no login
  cookie ([[media-proxy]]); the heart on a video adds it to a built-in Favorites playlist,
  because Stash scenes have no favourite flag ([[playlists-and-favorites]]); performer
  follow hearts on tiles; the performer gender switch (Women / Men / Everyone); transparent
  studio tiles ([[people-pages]]).
- Home: Continue moved to its own nav item with History and Stats tabs
  ([[continue-history-stats]]); a hero carousel shuffled per visit, advancing every 12 s;
  saved filters pinned as home rows; "For you" and "More with…" rows from watch, rating and
  O affinity, tags weighted by rarity ([[home-feed]]).
- Browse: category tiles, multi-select with bulk Favorite and Add to playlist.
- Player: a quality menu whose Auto drops to 720p after 3 stalls in 30 s; markers on the seek
  bar (`b` marks, `[`/`]` jump) listed as chapters; per-studio intro skip ([[player]],
  [[seek-bar-markers]]).
- Scene page: inline title and tag editing; Identify on StashDB for one scene ([[scene-page]]).
- Panic key (double Esc); login rate limiting and secure cookies behind HTTPS
  ([[optional-login]]).

## How it was verified

Hand use; cache counters on the Settings page.

## Snags

- First-time asset 404s during a locked Stash were being remembered; they are now retried
  after a minute (25fd7e1, [[stash-database-locked]]).
