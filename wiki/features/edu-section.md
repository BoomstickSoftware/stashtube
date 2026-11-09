---
title: Edu section
kind: feature
summary: Videos in the chosen Edu categories get their own /edu page and stay out of Home, Featured, For you, related videos and stations, while Browse and search still show them.
tags: [edu, blocklist, home, recommendations]
status: current
verified: 2026-11-09
updated: 2026-11-09
routes: [/edu]
api: [GET /api/edu/tags, PUT /api/edu/tags/:id, DELETE /api/edu/tags/:id, GET /api/scenes?edu=1, GET /api/scenes?noEdu=1]
code: [apps/server/src/edu.ts, apps/server/src/stash.ts, apps/server/src/blocklist.ts, apps/server/src/api.ts, apps/server/src/stations.ts, apps/web/src/pages/Edu.tsx, apps/web/src/lib/api/edu.ts, apps/web/src/pages/Tag.tsx, apps/web/src/pages/Settings.tsx, apps/web/src/lib/station.ts]
related: [edu-section-held-out-of-curated-views, blocklist-and-exclusions, home-feed, featured-ranking, related-videos, stations, data-model]
---

# Edu section

A video carrying any **Edu category** (a Stash tag on the list in the `edu_tags` table) is Edu.
Edu videos are kept apart from recreational viewing: flix never picks them for you, and
`/edu` lists them alone. What you see when you look for something yourself is unchanged.
The scope was chosen by the user ([[edu-section-held-out-of-curated-views]]).

## Behaviour

| Where | Edu videos |
|---|---|
| `/edu` (desktop nav item; phone header icon, graduation cap) | only them, with Browse's filters and sort; chips narrow to one or more Edu categories; **Manage** opens Settings |
| Home: every row (Featured, For you, Because you watched, More with, pinned rows, fixed rows) | held out |
| Featured endpoint (hero paging, Settings preview) | held out |
| Related videos | an Edu video's related ones are Edu only; anyone else's leave Edu out |
| Stations (queue, previews, covers, Shuffle everything, drifting) | held out |
| Affinity behind For you, Featured and More with | Edu plays, ratings and O's are ignored |
| Browse, search, typeahead, performer/studio/tag pages, Categories, facets | shown |
| History, Stats, Continue, playlists, station resume points | shown (what you did, or made by hand) |
| Discover (StashDB) | untouched: that is where new Edu content is found |

**Naming an Edu category lets Edu back in**, like a named blocked id ([[blocklist-and-exclusions]]):
a pinned row or a station whose filters include an Edu category shows its videos, and every Edu
video with it (one named category lifts the whole hold, not just that tag). `edu=1` does the same.

Managing the list: **Edu** on a category's page toggles it (toast with Undo); Settings → Library →
**Edu section** finds categories by name to add and removes one with the chip's ×. Each write
drops the cached Home feed and the web refetches every list.

## How

- `exclusions()` carries `eduTags` (always) and `holdEdu` (off). `curated()` in `edu.ts` turns
  it on for Home and Featured; `withExclusions` then adds a `tags EXCLUDES <edu> depth 0` level.
- `sceneFilter`: `edu` adds `tags INCLUDES <edu>` (with no Edu categories, `id EQUALS 0`, so
  nothing); `noEdu` turns the hold on; `edu` or a named Edu category turns it off.
- After-the-fact filters (`isBlocked`: Because you watched, station resume) honour `holdEdu`.
- `relatedSide()` picks the side for related videos; `relatedScenes(…, within)` restricts to Edu.
- The station queue (`lib/station.ts`) asks `/scenes` with `noEdu=1`; previews and covers set it
  on the server.
- Depth 0: a child of an Edu category is not Edu unless it is on the list itself.

## Limits and numbers

- With no Edu categories (the state at deploy, 2026-11-09) no query changes shape.
- Not verified against Stash before shipping (no local `.env` on 2026-11-09); the criteria are
  the same generated types the blocklist and related videos already send.
