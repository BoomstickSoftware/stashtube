---
title: Performer, studio and tag pages
kind: feature
summary: The entity pages and directories, what follow, pin and block mean on each, the gender switch, age at filming, studio families and the three Studios views.
tags: [performers, studios, tags, directories, favorites]
status: current
verified: 2026-10-30
updated: 2026-10-30
routes: [/performers, /performer/$id, /studios, /studio/$id, /tags, /tag/$id]
api: [GET /api/performers, GET /api/performers/:id, PUT /api/performers/:id/favorite, PUT /api/performers/:id/rating, GET /api/studios, GET /api/studios/:id, PUT /api/studios/:id/favorite, PUT /api/studios/:id/intro, GET /api/tags, GET /api/tags/tiles, GET /api/tags/:id, PUT /api/tags/:id/favorite, PUT /api/blocklist/:kind/:id]
code: [apps/web/src/pages/Directories.tsx, apps/web/src/pages/Performer.tsx, apps/web/src/pages/Studio.tsx, apps/web/src/pages/Tag.tsx, apps/web/src/components/EntityHeader.tsx, apps/web/src/components/People.tsx, apps/server/src/api.ts]
related: [browse-and-filters, whisparr-shelf, blocklist-and-exclusions, stash-owns-activity, playlists-and-favorites, stations]
---

# Performer, studio and tag pages

Each entity page is a header, actions, the entity's videos through the shared list
([[browse-and-filters]]), and for performers and studios a "Not in your library yet" shelf
([[whisparr-shelf]]).

## Actions on an entity

- **Follow** (heart): Stash's performer or studio favourite, so Stash's UI agrees
  ([[stash-owns-activity]]). Video hearts are different: a flix playlist
  ([[playlists-and-favorites]]).
- **Rating** (performers), **Block** (hidden everywhere, [[blocklist-and-exclusions]]), **Add to
  filters** (stacks it, [[browse-and-filters]]), **Station** from this entity's videos
  ([[stations]]).
- Studios: **intro skip** in seconds, honoured by every player and by Start over
  (`PUT /api/studios/:id/intro`, 0–600). A studio page includes its sub-studios.
- Tags: **Pin** = Stash's tag favourite; pinned tags head the Categories page.

## Directories

- **Performers**: sort by videos, name or random; **Following** filter; the Settings gender
  switch (Women / Men / Everyone, `performerGender` in the settings table) applies here, to
  search, stats and every people filter. A performer's page shows her age at filming on each
  card (`ageAt` from birthdate and scene date).
- **Studios**: **Networks** (each network heads its sub-studios with an "All of …" tile for the
  combined feed; independents last; a text filter shows the flat grid), **Grid** and **Table**
  views; sort by Most videos or Name; Following. Kept per browser. Counts include sub-studios
  (`scene_count(depth: -1)`). Studio tiles are transparent logos.
- **Categories** (tags): tag tiles with a picture, warmed at boot ([[caching]]); pinned first.

## Where

`pages/Directories.tsx` holds all three directories; `EntityHeader.tsx` the shared header.
Blocked ids are dropped after each finder query ([[stash-filters-have-no-id-criterion]]).
