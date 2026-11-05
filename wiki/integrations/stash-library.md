---
title: Stash library (what Stash holds)
kind: integration
summary: The library flix shows: the two scanned folders, the path-based saved filters, size and codec mix with dates, and the StashDB-linking facts flix depends on.
tags: [stash, library, stashdb, media]
status: current
verified: 2026-10-30
updated: 2026-11-04
sources: [nas:docs/services.md, nas:docs/operations.md, nas:docs/history/2026-10-29-agent-red-girl-import.md]
related: [stash-api, nfs-media, whisparr-api, stashdb, delete-via-whisparr, duplicates-workbench]
---

# Stash library (what Stash holds)

Library operations (scans, Identify, clean, imports of files you already have) are the nas
repo's: `nas:docs/services.md` (stash row) and `nas:docs/operations.md`. This page records what
flix assumes about the library.

## Folders

- Libraries: `/data/adult/movies` and `/data/adult/scenes`, i.e. `/volume1/Media/adult/…` on the
  NAS, mounted **read-only** in Stash. flix sees the same files at `/media/adult` ([[nfs-media]]).
- `private_movies`, `private_tv` and `cam_videos` are mounted but left out of the libraries by
  the user's choice (removed 2026-10-24, their scenes cleaned from the database).
- Stash calls every video a scene; feature films and studio scenes are told apart by folder.
  Saved scene filters "Feature films" (path includes `/data/adult/movies/`) and "Scenes"
  (`/data/adult/scenes/`), newest first, are path-based so new imports land right with no upkeep.
- Whisparr writes files as `adult/scenes/<network>/<studio>/<date> - <title> [<stashdb uuid>]/…`
  and `adult/movies/<network>/<studio>/<Title (Year)>/…` ([[whisparr-api]]).

## Size and mix

| Date | Fact |
|---|---|
| 2026-10-26 | 477 of 520 files mp4/h264/aac; the other 43 (mkv hevc/h264-ac3, avi mpeg4, wmv vc1, av1) transcode in browsers ([[player]]) |
| 2026-10-29 | Whisparr files, Stash scene files and the files on disk were the same 1,940 paths |
| 2026-10-30 | 2,207 scenes, 2,204 with a perceptual hash; no duplicate groups at distance 0, 4 or 8 ([[duplicates-workbench]]) |
| 2026-10-30 | the library has no user-made markers yet (seek-bar ticks were verified with patched data) |

## StashDB linking

- Whisparr puts the StashDB scene uuid in the folder name (`… [<uuid>]/`), equal to `stash_id`
  on matched scenes. flix matches Stash scenes to Whisparr and StashDB by that id
  ([[whisparr-shelf]], [[delete-via-whisparr]]).
- Feature films have **no** StashDB entry (StashDB has no full films; Whisparr matched them by
  TMDB), so 22 films carry title, date, studio and synopsis copied from Whisparr instead.
- Identify matches StashDB by fingerprint only; a `stash_id` set beforehand does not make it
  find the scene (verified 2026-11-04: 101 linked scenes stayed bare, 3 freshly scanned ones
  with known phashes identified; _until then this page said Identify honours an existing id,
  from the 2026-10-29 run of 363 linked scenes, whose fingerprints StashDB knew_). A scene
  whose fingerprint StashDB lacks gets no title or cover from Identify; Stash then serves the
  733-byte placeholder `screenshot` and `is_missing:"cover"` lists it. The way in is a scrape
  by uuid and a `sceneUpdate`: `scripts/library-reconcile.mjs --fill`
  ([[library-reconcile]], [[identify-leaves-linked-scene-bare]]). 47 scenes carry a StashDB id
  different from Whisparr's (2026-11-04; StashDB duplicates or Whisparr mismatches), left as is.
- The Whisparr → Stash connection queues a Scan and then an Identify per imported file (path map
  `/volume1/Media/adult`→`/data/adult`), so a bulk import builds a long Stash queue (~50 min for
  102 jobs on 2026-10-29) during which reads may hit `database is locked`
  ([[stash-database-locked]]). The change check then picks the new scenes up ([[caching]]).
