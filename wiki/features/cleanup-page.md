---
title: Clean up page
kind: feature
summary: Ready-made lists of likely deletions (low resolution, never watched, low rated, not on StashDB) with selection always on and a link to the duplicates workbench.
tags: [cleanup, delete, library]
status: current
verified: 2026-10-30
updated: 2026-10-30
routes: [/cleanup]
api: [GET /api/scenes]
code: [apps/web/src/pages/Cleanup.tsx]
related: [duplicates-workbench, delete-via-whisparr, browse-and-filters]
---

# Clean up page

`/cleanup`, linked from Settings, is the shared scene list with selection always on and
blocked videos included, so a pass over the library can end in one Delete
([[delete-via-whisparr]]).

## Lists

| List | Query |
|---|---|
| Below 720p | `maxHeight: 720` |
| Never watched | `unwatched`, added 30+ days ago (`olderDays: 30`) |
| Rated ★2 or less | `maxRating: 2` |
| Not on StashDB | `unmatched` (no StashDB match: often mislabelled) |

Picking a list sets those filters; the filter bar narrows further by performer, studio or tag
([[browse-and-filters]]). Cards select on tap. **Duplicates** opens the
[[duplicates-workbench]] (the earlier "possible duplicates, distance 8" list lives there now).
Without Whisparr configured the Delete button is hidden (`/api/features` → `deleteScenes`).
