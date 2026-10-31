---
title: Duplicates workbench
kind: feature
summary: Stash's perceptual-hash groups side by side, with the copy to keep chosen by pixels, bit rate, size, then watch history, and the rest pre-selected for the delete dialog.
tags: [duplicates, cleanup, delete, phash]
status: current
verified: 2026-10-30
updated: 2026-10-30
routes: [/duplicates]
api: [GET /api/duplicates?distance=&durationDiff=]
code: [apps/web/src/pages/Duplicates.tsx, apps/server/src/duplicates.ts, apps/server/src/duplicates.test.ts, apps/server/src/stash.ts]
related: [cleanup-page, delete-via-whisparr, stash-api]
---

# Duplicates workbench

`/duplicates` (from Clean up) shows every group Stash's `findDuplicateScenes` returns, side by
side with resolution, bit rate, size, codec, plays and path.

## Behaviour

- `GET /api/duplicates?distance=&durationDiff=` runs `findDuplicateScenes` over every scene,
  blocked and hidden too, cached like any scene read ([[caching]]).
- `duplicates.ts` names the copy to **keep**: most pixels, then bit rate, then size, then the
  one already watched, rated or O'd (so history stays attached to a scene that exists), then
  the lowest id. The rest are **pre-selected**; ticks override the suggestion until Delete (the
  normal delete dialog, so Whisparr removes the file, [[delete-via-whisparr]]) or Reset.
- Distance chips **Exact / Close / Loose** = 0 / 4 / 8, plus a duration tolerance.

## Numbers

On 2026-10-30 the library had 2,204 of 2,207 scenes hashed and **no groups at any distance**,
so the page was checked with a stubbed response; the empty state matters. It fills as
duplicates arrive. `duplicates.test.ts` pins the keep rule.
