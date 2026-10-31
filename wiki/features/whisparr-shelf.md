---
title: Whisparr shelf and Get
kind: feature
summary: The "Not in your library yet" shelf fed by StashDB and labelled by Whisparr (below the library, collapsed to its heading and count), the Home row of undownloaded releases, and the two single-scene Get writes.
tags: [whisparr, stashdb, downloads, performers, studios, home]
status: current
verified: 2026-10-31
updated: 2026-10-31
api: [GET /api/whisparr/performer/:id?page=, GET /api/whisparr/studio/:id?page=, GET /api/whisparr/new, GET /api/whisparr/activity, POST /api/whisparr/get/:id, POST /api/whisparr/get-remote/:stashdbId, GET /api/features]
code: [apps/server/src/whisparr.ts, apps/server/src/stashdb.ts, apps/server/src/remote.ts, apps/server/src/whisparr.test.ts, apps/server/src/stashdb.test.ts, apps/web/src/components/WantedRow.tsx, apps/web/src/lib/api/whisparr.ts]
related: [whisparr-nothing-monitored, library-before-wanted-shelf, media-proxy, whisparr-api, stashdb, people-pages, home-feed, prod-checks-read-only]
---

# Whisparr shelf and Get

StashDB is the catalogue and Whisparr the executor. With `WHISPARR_URL` and
`WHISPARR_API_KEY` set, `/api/features` says `whisparr: true`; `stashdb: true` when the StashDB
credentials resolved ([[stashdb]]).

## The shelf

Performer and studio pages ([[people-pages]]) get **"Not in your library yet"** (a
`WantedShelf`): the entity's scenes on StashDB (by its StashDB ids), 24 a page, newest first.

It sits **below the library's grid** and starts **collapsed** to one heading button, "Not in
your library yet · 24+ on StashDB" (the first page's count, "+" while there are more pages;
"on Whisparr" in the fallback), per [[library-before-wanted-shelf]] (_above the grid and always
open until 2026-10-31_). A tap expands it; open/closed is remembered per browser
(`flix.wanted.open`, default closed). The first page is fetched either way, for the count, but
no cover is rendered while closed; nothing is rendered at all until that page arrives, and
since the shelf is below the grid its arrival moves nothing above it. Being after the library's
own infinite grid, the shelf is reached after every library page has scrolled in.

Open, a Row/Grid toggle in the heading picks the layout, remembered per browser
(`flix.wanted.view`, like the Studios views), with the hint "Get fetches one scene":

- **Row** (default): a sideways carousel with a "Show more" card at the end for the next page.
- **Grid**: two columns on a phone, up to five on a wide screen, and a `Sentinel` under it
  loads the next page as the bottom comes into view, so the whole catalogue scrolls.

Each scene is labelled:

- **already in Stash**: dropped from the shelf (`sceneStashIdMap`);
- **in Whisparr's movie list**: state from the queue and the last grabs: available / grabbed /
  downloading / downloaded;
- **remote**: only StashDB knows it.

Without StashDB the shelf falls back to Whisparr's own list (`source: 'whisparr'`). Covers are
StashDB's (`images[].url`, the widest; or Whisparr's `images[].remoteUrl`, the same host) and
reach the browser only through `/media/remote/<token>` with `srcSet`/`sizes` and lazy loading:
~19 KB WebP at 640 instead of a ~280 KB hotlinked original ([[media-proxy]]). A cover on a host
outside the allowlist is dropped (`image: null`, "No cover").

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
blocks both routes ([[prod-checks-read-only]]). `/api/whisparr/activity` shows the queue.

## Numbers

Whisparr's movie list is ~41 MB / 13,079 entries (2026-10-31) and is cached 15 min in memory
only (`LIST_TTL`; _2 min until 2026-10-31_; a Get drops it, the 30 s queue and grab reads show
what moved meanwhile); StashDB pages are cached 10 min (tag `stashdb`, ~8 KB each, in the
snapshot since 2026-10-31) ([[caching]]). 0/36 studios and 0/9,363 scenes were
monitored on 2026-10-30.
