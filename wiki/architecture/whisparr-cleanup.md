---
title: Whisparr cleanup (delete scene records nothing is fetching)
kind: architecture
summary: Deletes Whisparr's scene records that have no file and that nothing is fetching, after a Backup, 100 at a time, never files and with no import exclusion.
tags: [whisparr, cleanup, operations]
status: current
verified: 2026-11-02
updated: 2026-11-02
code: [apps/server/src/cleanup.ts, apps/server/src/cleanup.test.ts, apps/server/src/whisparr.ts, scripts/whisparr-cleanup.mjs]
related: [whisparr-sync, stashdb-mirror, whisparr-nothing-monitored, whisparr-watch-cascades-to-studios-and-performers]
---

# Whisparr cleanup

While performers and studios were watched, Whisparr learned ~28k scene records, about 2.7k of
them with a file ([[whisparr-watch-cascades-to-studios-and-performers]]). flix now browses
StashDB itself and a Get adds a scene by its StashDB id ([[stashdb-mirror]]), so a record
without a file that nothing is fetching only slows Whisparr's 41 MB list.

## What goes, what stays

| Record | |
|---|---|
| Has a file | kept |
| Monitored (a Get waiting for a release) | kept |
| Downloading or grabbed | kept |
| In `whisparr_gets` or the Get queue | kept |
| A feature film (`itemType: 'movie'`) | kept |
| Anything else | deleted: `DELETE /movie/editor` with `deleteFiles: false`, `addImportExclusion: false` |

No import exclusion, so a deleted scene can be fetched again later. Existing exclusions (from
deletes of watched scenes) are untouched.

## Running it

`node scripts/whisparr-cleanup.mjs` prints the plan; `--studio <stashdb-id>` narrows it to one
studio; `--apply` runs it on the server in the background and the script prints progress.
Each run starts with Whisparr's `Backup` command and stops if it does not complete. Deletes go
100 at a time, 5 s apart. With `--studio`, the server then refreshes that studio
(`RefreshStudios`) and reports how many scene records came back.

`GET /api/whisparr/cleanup` is the status; `POST /api/whisparr/cleanup {apply?, studio?}`
previews or starts (409 while one runs).

## Verified (2026-11-02)

One studio first: 31 file-less records deleted after a completed Backup, `RefreshStudios`
completed, **0 came back**, and its 4 records with files were untouched. An unmonitored studio's
refresh does not re-learn deleted scenes ([[whisparr-unwatched-studios-stop-learning-scenes]]).
