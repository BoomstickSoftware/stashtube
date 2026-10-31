---
title: "2026-10-31: Faster Home, stations only when made, Continue cleared"
kind: history
summary: The user's answers to the review round: 13 finished resume points cleared, playlists left outside the blocklist, only saved stations remembered, and a Featured pool slimmed to halve a cold Home.
tags: [history, home, featured, stations, performance]
date: 2026-10-31
commits: [cd3e7f5, e1d2c54, 8e94a9f]
status: record
verified: 2026-10-31
updated: 2026-10-31
related: [featured-ranking, home-feed, stations-only-user-made, playlists-ignore-blocklist, continue-history-stats]
---

# 2026-10-31: Faster Home, stations only when made, Continue cleared

## What changed

- **Continue**: the 13 resume points past 90% were set to 0 at the user's word (49 → 36);
  plays and history untouched → [[continue-history-stats]].
- **Playlists** stay outside the blocklist; no code change → [[playlists-ignore-blocklist]].
- **Stations** (cd3e7f5): only saved stations and playlists remember their place; ad-hoc
  resume rows dropped → [[stations-only-user-made]].
- **Featured** (e1d2c54): the pool carries only scoring fields and the winners get their cards
  by id; plays and edits expire the pool instead of dropping it → [[featured-ranking]].
- **Activity and restarts** (8e94a9f): tag sizes from one cached `findTags` instead of
  `tags { scene_count }` in the activity query (cold Stats 0.5 → 0.05–0.15 s, cold Home
  1.3–1.6 → 1.0–1.2 s); the pool is snapshotted (3.3 MB file), so a deploy starts warm.

## How it was verified

Read-only timings of each candidate query against Stash (`nas:scripts/stash.py`): full-card
pool 2.3 s / ~7 MB, scoring fields 0.8 s / 2.3 MB, of which `tags` 0.5 s. In production after the
deploy: cold `/api/home` 1.26–1.59 s (was 2.5–2.9 s), Featured for a new seed on a cached pool
0.04 s, cards complete with their reasons. 80 tests, web `tsc -b`, lint, image build.

## Snags

- The review guessed the activity query was slow for its card fields; measuring showed the
  cards cost 0.02 s for 65 videos and `scene_count` on its tags 0.5 s.
- Otherwise none beyond the measurements; `stash.py` adds ~0.15 s per call, subtracted above.
