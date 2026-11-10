---
title: Unlisted and the Vault
kind: feature
summary: Unlisting a video, category, performer or studio keeps its videos off Home, Featured, stations and unrelated recommendations and lists them in the Vault, while Browse and search still show them.
tags: [unlisted, blocklist, home, recommendations]
status: current
verified: 2026-11-09
updated: 2026-11-09
routes: [/vault, /edu]
api: [GET /api/unlisted, PUT /api/unlisted/:kind/:id, DELETE /api/unlisted/:kind/:id, GET /api/unlisted/scenes, PUT /api/scenes/:id/unlisted, DELETE /api/scenes/:id/unlisted, GET /api/scenes?vault=1, GET /api/scenes?noUnlisted=1]
code: [apps/server/src/unlisted.ts, apps/server/src/stash.ts, apps/server/src/blocklist.ts, apps/server/src/api.ts, apps/server/src/stations.ts, apps/web/src/pages/Vault.tsx, apps/web/src/lib/api/unlisted.ts, apps/web/src/components/EntityHeader.tsx, apps/web/src/pages/Scene.tsx, apps/web/src/components/CardMenu.tsx, apps/web/src/pages/Settings.tsx, apps/web/src/lib/station.ts, scripts/deploy-check.mjs]
related: [unlisted-and-vault, blocklist-and-exclusions, second-tags-exclusion-ignored, home-feed, related-videos, stations, data-model]
---

# Unlisted and the Vault

Unlisted is one of the hide marks ([[hide-means-delete-block-or-unlist]]); Block only stops
downloads and is independent of it ([[blocklist-and-exclusions]]). Unlisted means findable when you look, never picked for you. A
video is Unlisted when it, any of its categories, any of its performers, its studio or the
studio's parent is Unlisted. The choices behind it are the
user's ([[unlisted-and-vault]]). _It replaced the Edu section, shipped earlier on 2026-11-09:
the Edu categories became Unlisted categories, `/edu` redirects to `/vault`._

## Behaviour

| Where | Unlisted videos |
|---|---|
| **Vault** (`/vault`; under the You tab, [[navigation]]) | only them, with Browse's filter panel (title search, performer, studio, category, rating, length), sort and Station; chips narrow to what unlists them, "Unlisted by hand" included; **Manage** opens Settings |
| Home: hero, Featured and every row flix fills (For you, Because you watched, More with, New from performers you follow, Recently added, Discover, Top rated, Latest releases, Most watched) | held out; a pinned row that names the Unlisted entity shows that one's videos |
| Home's not-downloaded shelf (StashDB) | held out, matched through the StashDB mirror (see Limits) |
| Featured endpoint (hero paging, Settings preview) | held out |
| Stations: queue, previews, covers, Shuffle everything | held out unless the station names the entity or starts from the Vault |
| Related videos and drifting stations | an Unlisted video qualifies only if **every reason** it is Unlisted is also true of the video you are on; from a normal video, none |
| Category tiles' pictures | a normal category avoids Unlisted videos; an Unlisted one uses its own |
| Affinity (For you, Featured, More with) | Unlisted plays, ratings and O's ignored; an Unlisted performer is never a "More with" |
| Browse, search, typeahead, entity pages, directories, facets, History, Stats, Continue, playlists, station resume | shown |
| Discover (StashDB) and Whisparr fetching | untouched: following still fetches new releases; they are just never featured |

**Managing**: **Unlist / Unlisted** on category, performer and studio pages (with a notice under
the header) and on the video page ("Unlisted through …" names the entities that unlist it);
**Unlist** in a card's menu; Settings → Library → **Hidden**: search to add, chip × to remove,
and the videos unlisted by hand with "Show again". Each write is one tap with Undo. _Until
2026-11-09_ unlisting something blocked unblocked it and the reverse.

## How

- `unlisted` table (kind, stash_id, name); one video by hand gets the reserved Stash tag
  **Unlisted** (`reservedTag` in `stash.ts`), which counts as an Unlisted
  category.
- `exclusions()` carries `unlisted` (the id sets); `curated()` sets `holdUnlisted` for Home and
  Featured, `noUnlisted` does for stations. `withExclusions` merges the ids into one EXCLUDES
  criterion per field ([[second-tags-exclusion-ignored]]); `sceneFilter` drops the
  ids a query names.
- `vault=1` adds an OR of the Unlisted categories (depth -1), performers and studios (depth -1).
  With an age range it is distributed over the age buckets, fewer buckets so the chain stays at
  or under 16 (`MAX_OR`); a filter holds one OR chain. _32 shipped first and overflowed
  SQLite's parser (502 on Vault + age, 2026-11-09)._
- Related videos: `relatedSide()` gives the source's reasons; with none, Stash leaves Unlisted
  out; with some, the candidates are fetched unheld and filtered by `withinReasons`.
- `isBlocked` honours the hold, so "Because you watched" starts from the last play that is not
  Unlisted.

## Limits and numbers

- The shelf filter knows a StashDB scene's performers, studio and categories only if flix's
  mirror holds it; one it has never seen is judged by the followed performer it came from.
  Categories match by name (StashDB's tag ids are not Stash's).
- The hold reaches sub-studios and child categories (depth -1); a related candidate's reasons
  compare the scene's own studio and its parent only.
- `node scripts/deploy-check.mjs` fails a deploy when, with anything Unlisted, a Vault video is
  on Home (pinned rows aside), Featured or a normal video's related list, or `noUnlisted` does
  not shrink the library.
