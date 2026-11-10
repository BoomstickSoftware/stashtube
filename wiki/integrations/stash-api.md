---
title: Stash API facts
kind: integration
summary: What flix relies on in Stash v0.31.1's GraphQL and asset endpoints — auth header, generated assets, Range and HLS behaviour, the mutations used, updated_at semantics and how a locked SQLite shows up.
tags: [stash, graphql, api, hls, assets]
status: current
verified: 2026-10-31
updated: 2026-11-09
sources: [nas:docs/services.md]
code: [apps/server/src/stash.ts, apps/server/src/media.ts]
related: [stash-layer, media-proxy, caching, stash-database-locked, stash-library, regenerate-stash-schema]
---

# Stash API facts

Stash v0.31.1 runs on the NAS at `http://192.168.0.10:9999` (flotilla stack; its config,
libraries and operations are the nas repo's, `nas:docs/services.md`). This page keeps only what
flix depends on. Schema types: [[stash-layer]].

## Auth and transport

- GraphQL: `POST /graphql`, header `ApiKey: <key>` (`STASH_API_KEY`). Asset and stream paths
  take the same header; no `apikey` query parameter is needed, HLS included.
- `/graphql` answers CORS `*`, but flix never calls it from the browser ([[media-proxy]]).
- flix times Stash calls out after 60 s.

## Generated assets (per scene, `/scene/<id>/…`)

| Path | Exists? |
|---|---|
| `screenshot` | yes; a 733-byte placeholder when the scene has no cover (filter `is_missing:"cover"` lists them) |
| `preview` | yes, mp4 clip |
| `vtt` + `sprite` | yes, 160×90 tiles, ~81 per scene |
| `webp` | **404**: animated webp previews are not generated |

Stash sends `Cache-Control: no-cache` on all of them; flix caches them itself ([[caching]]).
Image URLs carry a version stamp `?t=` that changes with the image. Performer, studio and tag
images come from `/performer|studio|tag/<id>/image`.

## Streams

- `/scene/<id>/stream` honours `Range` (direct play, byte ranges).
- `/scene/<id>/stream.m3u8` is the hardware (VAAPI) transcode; it lists segments by
  root-relative path (`/scene/<id>/stream.m3u8/<n>.ts`), which the proxy rewrites. The first
  segment of a VC-1 WMV took ~2.3 s (2026-10-26).

## Mutations flix uses

`sceneUpdate` (rating, title, tags, stash_ids, cover), `sceneAddPlay`, `sceneSaveActivity`
(resume point, play duration), `sceneAddO`, `sceneMarkerCreate` / `sceneMarkerUpdate` /
`sceneMarkerDestroy`, `sceneDestroy` (with generated files and file record), `tagCreate`
(Highlight, Not interested), `performerUpdate` / `studioUpdate` / `tagUpdate` (favourite),
`metadataIdentify` (one scene against StashDB). Reads of note: `findScenes` with
`random_<seed>` sort, `findDuplicateScenes(distance, duration_diff)`, `scrapeSingleScene`
against the stash-box, `configuration.general.stashBoxes` ([[stashdb]]).

## Semantics that matter

- **`findScenes(ids: [...])` fails the whole call when one id no longer exists** ("scene with id
  3302 not found") rather than skipping it. `findScenesByIds` in `stash.ts` drops the missing id
  and asks again (`missingSceneId`, since 2026-11-09). Seen when a Featured ranking cached before
  six deletes was restored from the snapshot after a deploy: `/api/featured` answered 502 until
  the ranking refreshed.

- `metadataIdentify` returns a job id; `findJob(input: { id })` answers `status`, `progress`
  and `error`, and `null` for a job no longer in the queue (inferred from the schema, 2026-10-31;
  flix treats a vanished job as finished and drops its caches). A single-scene Identify is a
  few seconds; flix waits up to 40 s in the request and follows the job afterwards
  ([[scene-page]], [[caching]]).

- `sceneSaveActivity` does **not** change a scene's `updated_at`; `sceneUpdate` does (verified
  2026-10-26). The change check relies on this.
- During a scan Stash's SQLite rejects reads with `database is locked` and asset requests may
  404; flix retries with backoff and serves stale copies ([[stash-database-locked]]).
- `Stash HTTP 4xx` from a filter means a criterion the type lacks
  ([[stash-filters-have-no-id-criterion]]).
- Nested `AND` exclusions ~0.2 s; `random_<seed>` sort is stable for paging (spike 2026-10-26).
- Introspect by hand: `scripts/stash.py q '{ __type(name:"TagFilterType"){ inputFields { name } } }'` ([[gather-context]]).
