---
title: "2026-11-09: Background load round (initiative C)"
kind: history
summary: The Whisparr guard is paced by use and its switch, Featured rolls every 5 min on a cached ranking, and two smaller cleanups.
tags: [history, performance, whisparr, featured]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [whisparr-sync, featured-ranking, home-feed, stashdb-mirror, caching, 2026-11-09-strategy-review]
---

# 2026-11-09: Background load round (initiative C)

## What changed

- Whisparr guard timer: every 15 min while flix was used in the last 30 min, hourly otherwise,
  never while the switch is off; a kick after the Get queue empties ([[whisparr-sync]]).
- Featured: the browser's seed lasts 5 min, kept on a quick return ([[home-feed]]); the ranking
  is cached per seed and dials, candidates built once per pool ([[featured-ranking]]); per-seed
  answers are kept stale 2 h (`staleFor`, [[caching]]).
- `sdb_queries` rows unused for 30 days are deleted daily ([[stashdb-mirror]]).
- "Because you watched" finds the last played video with `lastPlayed()` instead of `history(1)`.

## How it was verified

`node scripts/check.mjs`: 144 server tests (new: the timer's due rule, a short `staleFor`). After
the deploy, a new seed: `/api/featured` 122 ms first, hero pages 51–54 ms, a repeat 7 ms; `/api/home`
21 ms.
