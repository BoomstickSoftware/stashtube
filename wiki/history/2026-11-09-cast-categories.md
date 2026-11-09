---
title: "2026-11-09: Cast categories"
kind: history
summary: flix started filing every video by cast (F, M, X) as Stash categories, with Settings controls per mix, Cast M blocked, and a deploy check on the sync.
tags: [cast, stash]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [cast, cast-taxonomy]
---

# 2026-11-09: Cast categories

## What changed

- `cast.ts` (classification, sync, status), Stash helpers in `stash.ts` (`castInputs`,
  `ensureTags`, `bulkTag`, `tagCounts`), `GET /api/cast`, `POST /api/cast/sync`; the sync runs
  after start and after Stash changes; the first run blocks `Cast: M`.
- Settings → Library → Cast; `deploy-check.mjs` reports the sync and fails on a sync error.

## How it was verified

- `node scripts/check.mjs`; `cast.test.ts` pins `castOf` (mixes, cumulative counts and caps, X
  for every other gender, Unknown).
- The library's real cast mix was measured first through flix's API (counts in [[cast]]).
- `scripts/phone-flow.mjs` at 440×956 with `/api/cast` stubbed: the Cast rows, levels, 44 px
  controls, no overflow.
- After deploy: see the deploy of this commit (the sync's first run in production).

## The Browse filter (same day)

- `CastFilter.tsx` in the filter panel: per-letter counts and Mix chips compiled to `tags` / `xtags`.
- Verified against production at 440×956: Men 1+ and Women exactly 2 gave "Show 390 videos", the
  URL `tags=<Men 1+>,<Women 2+>&xtags=<Women 3+>`, and 390 in Browse, matching the API.
- First production sync: 2,774 videos, 9,019 adds in 31 s, `Cast: M` blocked, mixes summing to
  the library (`deploy-check.mjs`: "mixes hold 2774 of 2774").
