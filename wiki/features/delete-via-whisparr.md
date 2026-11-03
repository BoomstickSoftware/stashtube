---
title: Deleting a video through Whisparr
kind: feature
summary: Why and how a delete goes to Whisparr first (it owns the files), then removes the Stash scene and playlist rows, and when it refuses to touch anything.
tags: [delete, whisparr, stash, files]
status: current
verified: 2026-11-02
updated: 2026-11-02
api: [POST /api/scenes/delete, GET /api/features]
code: [apps/server/src/delete.ts, apps/server/src/whisparr.ts, apps/server/src/stash.ts, apps/web/src/components/DeleteScenes.tsx]
related: [deleted-scenes-never-refetched-automatically, whisparr-api, nfs-media, stash-library, duplicates-workbench, cleanup-page, playlists-and-favorites]
---

# Deleting a video through Whisparr

Stash mounts the library read-only and flix's NFS mount is read-only too ([[nfs-media]]).
Whisparr owns the files, so a delete asks Whisparr.

## Where the button is

Delete in the multi-select bar, next to Favorite on the scene page, in the card menu, and in
the duplicates workbench. Each confirms first (`DeleteScenesDialog`) and says what it frees
(`SceneCard.size`). The buttons exist only when `/api/features` says `deleteScenes: true`,
which needs `WHISPARR_URL`, `WHISPARR_API_KEY` and `WHISPARR_PATH_MAP`
([[config-env]]).

## Steps (`deleteScene` in `delete.ts`)

1. Load the scene's file paths and StashDB ids from Stash.
2. For every file, find the Whisparr entry whose path equals it: looked up by StashDB id (from
   Stash's link or the `[uuid]` in Whisparr's folder name), feature films by scanning the full
   movie list ([[whisparr-api]]). `WHISPARR_PATH_MAP` turns Stash's `/data/adult/…` into
   Whisparr's `/volume1/Media/adult/…`.
3. If any file has **no Whisparr entry, nothing is touched**, unless that file is already gone
   from disk (checked on the read-only mount): then the Stash scene is removed and its StashDB
   ids (StashDB's endpoint only) are added to Whisparr's exclusions (`exclude`, `POST /exclusions`).
4. Delete each Whisparr movie **with its files and an import exclusion**, so discovery never
   fetches it again ([[deleted-scenes-never-refetched-automatically]]). A scene fetched again
   after a delete is excluded already; then no second exclusion is asked for. The delete drops
   the cached exclusion list.
5. `sceneDestroy` the Stash scene with its generated files and file record. If Stash is busy
   (a scan locks its database, [[stash-database-locked]]) the file is gone and the answer says
   to delete again later.
6. Drop the scene from every playlist.

A private session does not block deletes: they are curation ([[private-session]]).
