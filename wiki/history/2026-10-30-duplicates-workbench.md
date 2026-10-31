---
title: "2026-10-30: Duplicates workbench"
kind: history
summary: Phase 2m: /duplicates lists Stash's perceptual-hash groups side by side, names the copy to keep and pre-selects the rest for the delete dialog; checked with a stubbed response, as the library had no groups.
tags: [history, duplicates, cleanup]
date: 2026-10-30
commits: [794448a]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [duplicates-workbench, cleanup-page, delete-via-whisparr]
---

# 2026-10-30: Duplicates workbench

## What changed

- `/duplicates`, linked from Clean up ([[cleanup-page]]): `GET /api/duplicates?distance=&durationDiff=`
  runs Stash's `findDuplicateScenes` over every scene (blocked and hidden too) and shows each
  group side by side with resolution, bit rate, size, codec, plays and path.
- `duplicates.ts` names the copy to keep: most pixels, then bit rate, then size, then the one
  already watched or rated, then the lowest id; the rest are pre-selected and ticks override
  the suggestion until Delete (the normal dialog, so Whisparr removes the file,
  [[delete-via-whisparr]]) or Reset.
- Distance chips Exact / Close / Loose (0 / 4 / 8) and a duration tolerance
  → [[duplicates-workbench]].

## How it was verified

`duplicates.test.ts` for the keep rule. The library had 2,204 of 2,207 scenes hashed and no
groups at any distance that day, so the page was exercised with a stubbed response; the
empty state matters until duplicates arrive.

## Snags

None recorded.
