---
title: "2026-11-02: StashDB mirror, Discover, paced Gets, the Whisparr guard and cleanup"
kind: history
summary: Discovery moved from Whisparr to flix (rate-limited StashDB mirror, Discover, paced Gets), Whisparr now monitors only fetched scenes, and ~25k dead scene records were deleted.
tags: [history, stashdb, whisparr, discover, cleanup]
date: 2026-11-02
commits: [ba405cd, 5aa1b7f, c612aca, 90d4d0c]
status: record
verified: 2026-11-02
updated: 2026-11-02
related: [stashdb-mirror, discover, whisparr-sync, whisparr-cleanup, whisparr-nothing-monitored]
---

# 2026-11-02: StashDB mirror, Discover, paced Gets, the Whisparr guard and cleanup

## What changed

- **Rate limiter** (ba405cd): every StashDB call through one queue, 1 in flight, 1.1 s apart,
  backoff on 429/503, a 5-minute pause after 5 failures ([[stashdb-mirror]]).
- **Mirror, Discover, Get queue, guard** (5aa1b7f, c612aca): Postgres tables for StashDB scenes,
  names, scopes and query pages; `/discover` with filters, sort, multi-select and a Waiting tab
  ([[discover]]); the paced Get queue, weekly re-search and daily discovery; the sync rewritten
  as a guard that keeps every performer and studio unmonitored ([[whisparr-sync]]).
- **Cleanup** (90d4d0c): file-less records nothing is fetching deleted after a Backup
  ([[whisparr-cleanup]]).

## How it was verified

- `check.mjs --docker` green (118 tests); deploy-check 9/9 after each push.
- Unfiltered Discover: cold 7.2 s, cached 0.14 s. A followed performer (213 StashDB scenes)
  was answered from StashDB first and from the mirror within 2 minutes.
- Guard applied: 43 performers and studios and 24 stray scenes unmonitored, 0 failures; Whisparr
  read back 0 of 6,834 performers and 0 of 1,394 studios monitored.
- Discovery by hand: 49 StashDB requests, 0 throttled, 27 new releases queued; the queue drained
  one every 8 s and about 13 had imported within 10 minutes.
- Cleanup tested on one studio (31 deleted, refresh brought 0 back, 4 files untouched), then run
  in full: 25,457 records deleted in 26 minutes with 0 errors after a completed Backup; 2,681
  records with files, the monitored and downloading ones and 10 feature films kept.
- Phone screenshots of Discover, Select, Waiting and the picker (scratchpad only); the picker
  sheet lacked padding and was fixed (c612aca).

## Snags

- `sized()` takes only 320/480/640/960; 240 failed the web typecheck.
- A `useEffect` syncing the search box tripped the lint baseline; replaced by state adjusted
  during render that keeps a trailing space being typed.
- The server's cached Whisparr list dropped `itemType`; added so feature films are kept.
