---
title: Studio default categories
kind: history
summary: Default categories per studio, stored in flix and kept on the studio's videos by a sync that records what it added.
tags: [studios, tags, sync]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [studio-default-categories, studio-defaults-stored-in-flix, 2026-11-09-bulk-categories, roadmap]
---

# Studio default categories

Follows [[2026-11-09-bulk-categories]]: the user wanted to set a studio's categories once.
Decisions in [[studio-defaults-stored-in-flix]]; behaviour in [[studio-default-categories]].

## What changed

- Migration `0012_studio_categories`: tables `studio_categories`, `studio_category_adds`.
- `studioCategories.ts` (sync, `plan()` with tests), `stash.studioTagInputs`, `stash.tagsByIds`;
  four routes; the sync runs after the Cast sync at start and on Stash changes.
- Web: `StudioCategories` on the studio page and in Settings; `CategorySearch` extracted from the
  bulk sheet. Shared types `SyncRun` (now also `CastStatus.lastSync`), `StudioCategories`,
  `StudioCategoriesStatus`.

## Verified

`node scripts/check.mjs` (7 new tests for `plan()`); phone screenshots of the studio header, the
edit sheet and the Settings section with the new endpoints stubbed (Vite against production).
After the deploy, `GET /api/studio-categories` answered from production. The first real save
is the user's (checks against Stash must not write).
