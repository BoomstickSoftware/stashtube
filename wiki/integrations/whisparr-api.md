---
title: Whisparr API facts
kind: integration
summary: The Whisparr v3 endpoints and fields flix uses (movie list, queue and history states, lookup by StashDB id, add-and-search one scene, delete with files), their caching, and the nothing-monitored policy.
tags: [whisparr, api, downloads, policy]
status: current
verified: 2026-10-30
updated: 2026-10-30
sources: [nas:docs/services.md, nas:docs/known-issues.md]
code: [apps/server/src/whisparr.ts, apps/server/src/whisparr.test.ts, apps/server/src/delete.ts]
related: [whisparr-nothing-monitored, whisparr-shelf, delete-via-whisparr, whisparr-calendar-empty, stashdb, config-env]
---

# Whisparr API facts

Whisparr v3 ("Eros", Radarr-based, hotio `v3-3.5.0`) runs on the NAS at
`http://192.168.0.10:6970`, root folder `/volume1/Media/adult`, and **owns the library files**
(Stash and flix mount them read-only). Its quality profiles, indexers, import tuning and
history are the nas repo's (`nas:docs/services.md`, whisparr3 row; `nas:docs/known-issues.md`
#38, #40). flix needs `WHISPARR_URL`, `WHISPARR_API_KEY`, `WHISPARR_PATH_MAP` ([[config-env]]).
`whisparr.test.ts` pins every request below.

## Policy

**Nothing is monitored and flix never monitors or searches a studio or performer**
([[whisparr-nothing-monitored]]). Baseline 2026-10-30 17:00 UTC: 0/36 studios, 0 with
new-items monitoring, 0/9,363 scenes, 0/4,291 performers monitored. Both flix writes take
exactly one scene id and refuse anything else, feature films included.

## Endpoints (verified 2026-10-30)

| Call | Facts |
|---|---|
| `GET /api/v3/movie` | the **whole** list (9,384 entries, ~25 MB); ignores `performerId`, `studioId` and `*ForeignId` params; only `?stashId=<uuid>` filters. flix caches it 2 min in memory only |
| movie fields | `stashId`/`foreignId` (StashDB scene uuid), `studioForeignId`, `studioTitle`, `performerForeignIds`, `performerNames`, `hasFile`, `monitored`, `itemType` (`scene`/`movie`), `releaseDate`, `runtime`, `images[]` (`url` is `/MediaCover/…` needing the key; `remoteUrl` is the StashDB CDN), `movieFile.path` |
| `GET /api/v3/queue` | records carry `movieId` and `trackedDownloadState` → shelf state downloading |
| `GET /api/v3/history?eventType=1` | grabs → shelf state grabbed |
| `GET /api/v3/calendar` | **empty even with `unmonitored=true`** ([[whisparr-calendar-empty]]) |
| `GET /api/v3/movie/lookup?term=stash:<uuid>` | resolves one StashDB scene whether or not it is in the library: an existing entry returns its `id`, a new one `id` 0 with no `qualityProfileId`/`rootFolderPath` |
| `POST /api/v3/movie` | that lookup object plus `monitored: true`, `qualityProfileId`, `rootFolderPath`, `addOptions: { searchForMovie: true, monitor: "movieOnly" }` adds and searches **one** scene (flix's `get-remote`, placed like its studio siblings, else the first profile and root folder) |
| `POST /api/v3/command {name: "MoviesSearch", movieIds: [id]}` | search for one existing entry after `PUT movie` sets `monitored: true` (flix's `get`) |
| `DELETE /api/v3/movie/<id>?deleteFiles=true&addImportExclusion=true` | removes the entry and its files and prevents a re-grab ([[delete-via-whisparr]]) |
| studio `foreignId`, performer `foreignId` | their StashDB uuids |

## Paths

Whisparr knows a file as `/volume1/Media/adult/…`; Stash reports `/data/adult/…`;
`WHISPARR_PATH_MAP=/data/adult=/volume1/Media/adult` translates. Scenes land in
`adult/scenes/<network>/<studio>/<date> - <title> [<uuid>]/`, films in
`adult/movies/<network>/<studio>/<Title (Year)>/` ([[stash-library]]).

## Known behaviour

- A bulk `MoviesSearch` blocks imports for hours and a monitored studio refills the queue
  (incident 2026-10-28, `nas:docs/known-issues.md` #40): the reason for the policy.
- Read-only inspection from the Mac: `~/code/nas/scripts/arr.py whisparr3 get movie|studio|queue --json` ([[gather-context]]).
- Open question (nas #40): whether the daily `RefreshStudios` still adds newly released scenes to
  a studio whose new-items flag is off. Baseline for a diff: 9,363 scenes / 36 studios.
