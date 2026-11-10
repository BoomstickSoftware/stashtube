---
title: Bulk categories
kind: history
summary: Categories can be added to and removed from the selected videos, or every video in a list (a studio's whole library), from one sheet.
tags: [browse, tags, bulk, stash]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [browse-and-filters, people-pages, cast, roadmap]
---

# Bulk categories

Asked for by the user: put categories on every downloaded video of a studio at once.

## What changed

- `POST /api/scenes/tags` (`api.ts`): add and remove categories on `sceneIds`, or with none on
  every scene the query string's filters match. `stash.sceneIdsMatching` asks Stash fresh for
  the ids (`per_page: -1`, ids only); `stash.bulkSceneTags` writes them with `bulkSceneUpdate` in
  chunks of 500, one ADD and one REMOVE pass, drops each `scene:<id>` entry, expires the lists and
  takes Stash's new fingerprint (`acceptOwnChanges`). `bulkTag` now takes a list of tag ids (the
  Cast sync passes one).
- `BulkTagsSheet` (`components/BulkTags.tsx`): search, + / − per category, chips, Apply. Opened
  from the select bar's new Categories button and from a new list action "Categories for all N"
  (in "More" on a phone). Cast categories are left out of its search.
- Current behaviour: [[browse-and-filters]] (Bulk categories).

## Verified

`node scripts/check.mjs`; phone screenshots (Vite against production, reads only) of a studio
page's More sheet, the sheet with a search, with one category picked to add and one to remove,
and the select bar with its new icon. The write itself was not run from here (checks against
Stash must not write); its first real use is the user's.
