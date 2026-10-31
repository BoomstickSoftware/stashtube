---
title: Whisparr shelf and Get
kind: feature
summary: The "Not in your library yet" shelf fed by StashDB and labelled by Whisparr, the Home row of undownloaded releases, and the two single-scene Get writes.
tags: [whisparr, stashdb, downloads, performers, studios, home]
status: current
verified: 2026-10-31
updated: 2026-10-31
api: [GET /api/whisparr/performer/:id?page=, GET /api/whisparr/studio/:id?page=, GET /api/whisparr/new, GET /api/whisparr/activity, POST /api/whisparr/get/:id, POST /api/whisparr/get-remote/:stashdbId, GET /api/features]
code: [apps/server/src/whisparr.ts, apps/server/src/stashdb.ts, apps/server/src/whisparr.test.ts, apps/server/src/stashdb.test.ts, apps/web/src/components/WantedRow.tsx, apps/web/src/lib/api/whisparr.ts]
related: [whisparr-nothing-monitored, whisparr-api, stashdb, people-pages, home-feed, prod-checks-read-only]
---

# Whisparr shelf and Get

StashDB is the catalogue and Whisparr the executor. With `WHISPARR_URL` and
`WHISPARR_API_KEY` set, `/api/features` says `whisparr: true`; `stashdb: true` when the StashDB
credentials resolved ([[stashdb]]).

## The shelf

Performer and studio pages ([[people-pages]]) get **"Not in your library yet"** (a
`WantedShelf`): the entity's scenes on StashDB (by its StashDB ids), 24 a page, newest first.
A Row/Grid toggle in the heading picks the layout, remembered per browser
(`flix.wanted.view` through `useStored`, like the Studios views):

- **Row** (default): a sideways carousel with a "Show more" card at the end for the next page.
- **Grid**: two columns on a phone, up to five on a wide screen, and a `Sentinel` under it
  loads the next page as the bottom comes into view, so the whole catalogue scrolls. The
  library's own grid follows below, so a large catalogue in Grid view pushes it down until
  every page has loaded; switch back to Row to reach it sooner.

Each scene is labelled:

- **already in Stash**: dropped from the shelf (`sceneStashIdMap`);
- **in Whisparr's movie list**: state from the queue and the last grabs: available / grabbed /
  downloading / downloaded;
- **remote**: only StashDB knows it.

Without StashDB the shelf falls back to Whisparr's own list (`source: 'whisparr'`). Covers come
from StashDB (`images[].url`, or Whisparr's `images[].remoteUrl`, the same CDN).

Home gets **"New from your favourites, not downloaded"**: recent releases from favourite
performers, Whisparr list only, shown from 3 items ([[home-feed]]). A "Coming soon" row was
planned but Whisparr's calendar is empty ([[whisparr-calendar-empty]]).

## Get: one scene per click

- `POST /api/whisparr/get/:id`: a scene Whisparr lists. Monitors that scene and runs
  `MoviesSearch` for that id alone.
- `POST /api/whisparr/get-remote/:uuid`: a remote scene. Looks the StashDB id up in Whisparr
  (`movie/lookup?term=stash:<uuid>`) and `POST movie`s that one scene, monitored, with
  `addOptions.searchForMovie`, placed like its studio siblings (else Whisparr's first profile
  and root folder). A lookup that returns an existing id goes through the first path, so nothing
  is added twice.

Both writes refuse anything but a single scene id (feature films too). There is **no code path
that monitors or searches a performer or studio**: [[whisparr-nothing-monitored]].
`whisparr.test.ts` and `stashdb.test.ts` pin the exact requests; `scripts/mobile-check.mjs`
blocks both routes ([[prod-checks-read-only]]). `GET /api/whisparr/activity` returns the queue
and recent grabs but nothing in the web app calls it (the `useWhisparrActivity` hook was dead
code and was removed 2026-10-31); a "Requested" state on wanted cards would be its first user
([[roadmap]]).

## Numbers

Whisparr's movie list is ~41 MB / 13,079 entries (2026-10-31) and is cached 15 min in memory
only (`LIST_TTL`; _2 min until 2026-10-31_; a Get drops it, the 30 s queue and grab reads show
what moved meanwhile); StashDB pages are cached 10 min (tag `stashdb`, ~8 KB each, in the
snapshot since 2026-10-31) ([[caching]]). 0/36 studios and 0/9,363 scenes were
monitored on 2026-10-30.
