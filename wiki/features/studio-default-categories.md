---
title: Studio default categories
kind: feature
summary: Categories set on a studio's page that flix keeps on every one of its videos; add-only, put back if removed, taken off only where flix added them.
tags: [studios, tags, stash, sync]
status: current
verified: 2026-11-09
updated: 2026-11-09
routes: [/studio/$id, /settings]
api: [GET /api/studios/:id/categories, PUT /api/studios/:id/categories, GET /api/studio-categories, POST /api/studio-categories/sync]
code: [apps/server/src/studioCategories.ts, apps/server/src/stash.ts, apps/server/src/index.ts, apps/web/src/components/StudioCategories.tsx, apps/web/src/components/CategorySearch.tsx, apps/web/src/lib/api/studioCategories.ts]
related: [studio-defaults-stored-in-flix, people-pages, browse-and-filters, cast, data-model, 2026-11-09-studio-default-categories]
---

# Studio default categories

A studio page shows **Default categories** under its header buttons: the chips, then Edit (or
Set when there are none). The sheet searches categories (`CategorySearch`, shared with the bulk
Categories sheet; Cast categories are not offered and the server drops them), shows the picks as
chips and saves. Saving replaces the studio's list and runs the sync at once; the sheet then
says how many additions and removals were written.

## The sync (`studioCategories.ts`)

One read of every scene's studio and categories (`stash.studioTagInputs`, uncached), then
`plan()`:

- a video of a studio with defaults that lacks one gets it (`bulkTag` ADD per category) and a row
  in `studio_category_adds`;
- a video that has one already (from Stash or StashDB) is left alone and not recorded;
- a recorded video that no longer should have it (the default was dropped, or the video moved
  studio) loses it (REMOVE) and its row; a deleted video's rows are dropped;
- a recorded video whose category was removed by hand gets it back.

Only the studio's **own** videos: sub-studios are separate ([[studio-defaults-stored-in-flix]]).
A category deleted in Stash drops out of every studio's list. Stash is written before the rows,
so a failure leaves a category flix will not later remove, never the reverse. Runs one at a
time; a call during a run waits for one more run.

It runs 90 s after start and after each Stash change, after the Cast sync and before the
re-warm (`index.ts`); on save; and from **Settings › Library › Studio default categories**
(each studio and its list, the last sync, Sync now).

Stored in Postgres: `studio_categories` (studio, tag, both names) and `studio_category_adds`
(scene, tag) ([[data-model]]).
