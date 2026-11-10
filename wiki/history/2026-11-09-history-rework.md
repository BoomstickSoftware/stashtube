---
title: History grouped, paged, bulk removal with Undo
kind: history
summary: Initiative F of the strategy review: History rows are one per video per day, paged 40 at a time, removable in bulk, and removal deletes exactly those plays with an Undo that puts them back.
tags: [history, ui, stash]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [continue-history-stats, 2026-11-09-strategy-review, roadmap]
---

# History grouped, paged, bulk removal with Undo

Initiative F of [[roadmap]] ([[2026-11-09-strategy-review]]).

## What changed

- `GET /api/history` groups plays per video per day in the browser's zone (`tz`) and pages
  (`Page<HistoryEntry>`; `HistoryEntry` gained `day` and `times`). On 2026-11-09 the 221 plays
  made 195 rows, 16 of them repeats.
- Remove is `sceneDeletePlay` with the row's exact times (`POST /api/history/remove`); Undo is
  `sceneAddPlay` with the same times (`POST /api/history/restore`). Both drop only that scene's
  queries and the activity ones, leaving lists stale ([[caching]]). The old remove reset the
  whole play count and the resume point and dropped every `scene` query.
- The page: sticky bar with the count and Select; select mode with checkboxes, All loaded,
  Remove, Cancel; × on a row removes at once; toasts carry Undo. No `window.confirm`.

## Verified

`node scripts/check.mjs` (a `groupHistory` test: zone, order, paging); phone screenshots of the
list and select mode with the new answer stubbed from production's history.
