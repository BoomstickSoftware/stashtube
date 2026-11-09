---
title: "2026-11-09: Cache tags round (initiative A)"
kind: history
summary: Plays no longer delete Home and the filter counts, the Cast sync no longer wipes the cache or re-triggers itself, and four smaller cache fixes.
tags: [history, caching, performance, server]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [caching, cast, home-feed, 2026-11-09-strategy-review]
---

# 2026-11-09: Cache tags round (initiative A)

## What changed

- Home (`homeRows`, `api.ts`) and the facets with their raw sets (`sceneFacets`, `stash.ts`) no
  longer carry `activity:play` / `activity:resume`: a play or a progress save only expires them,
  so the old answer is served while one rebuild runs. After a play the server rebuilds Home for
  the last seed asked for, 5 s later ([[caching]], [[home-feed]]).
- `bulkTag` expires `scene` and `tag` instead of dropping every `scene` query; `mutate()` with no
  tags to drop drops nothing. The Cast sync runs before the re-warm instead of a minute after it,
  and `acceptOwnChanges()` takes Stash's fingerprint after its writes ([[cast]]).
- `sceneStashIdMap` is tagged `library` (dropped by a delete); its Map, `tagLookup`'s and
  Discover's Whisparr-movies-by-StashDB-id Map are built once per cached answer (`memoBy`).
- Category tiles read every scene (`per_page: -1`, was 3,000).
- The snapshot is written at most every 15 min when entries were only expired; related-video
  queries are `VOLATILE` (memory only, capped).

## How it was verified

`node scripts/check.mjs`: typecheck, lint baseline, 140 server tests (one new: an expiry alone
does not rewrite the snapshot). Live timing after deploy: see the log entry of the day.
