---
title: Whisparr cleanup (only records backed by a file or a fetch in flight stay)
kind: architecture
summary: Deletes every Whisparr scene record without a file unless it is downloading, a waiting Get or queued, then every studio and performer left with no scene, after a Backup; never files.
tags: [whisparr, cleanup, operations]
status: current
verified: 2026-11-02
updated: 2026-11-02
code: [apps/server/src/cleanup.ts, apps/server/src/cleanup.test.ts, apps/server/src/whisparr.ts, scripts/whisparr-cleanup.mjs]
related: [whisparr-performer-delete-takes-film-records, whisparr-sync, stashdb-mirror, whisparr-nothing-monitored, whisparr-watch-cascades-to-studios-and-performers]
---

# Whisparr cleanup

While performers and studios were watched, Whisparr learned ~28k scene records, about 2.7k of
them with a file ([[whisparr-watch-cascades-to-studios-and-performers]]). flix now browses
StashDB itself and a Get adds a scene by its StashDB id ([[stashdb-mirror]]), so a record
without a file that nothing is fetching only slows Whisparr's 41 MB list.

## What goes, what stays

The rule is the user's (2026-11-02): "clean up everything that doesn't have an underlying file on
disk unless a download is in progress or we recently requested it through flix. Same for
studios", without removing files or the metadata of files that exist.

| Scene record | |
|---|---|
| Has a file | kept |
| Downloading or grabbed (last 48 h) | kept |
| A Get from flix still waiting (`whisparr_gets`) | kept |
| In flix's Get queue | kept |
| Anything else, monitored or not, scene or feature film | deleted: `DELETE /movie/editor`, `deleteFiles: false`, `addImportExclusion: false` |

Then studios, read fresh after the scene deletes: a studio with **no scene record left** is
deleted (`DELETE /studio/:id?deleteFiles=false`), so a studio with any file keeps its record.
Performers the same way (`DELETE /performer/:id?deleteFiles=false`), added at the user's request
the same night. A performer is kept if any remaining record names them by id **or by name**, or
**credits** them: 4 of 2,707 scene records listed performer names without ids, and feature films
keep their cast only in credits; deleting a credited performer deletes the film's record
([[whisparr-performer-delete-takes-film-records]]).

No import exclusion, so a deleted scene can be fetched again later. Existing exclusions (from
deletes of watched scenes) are untouched. _Until 2026-11-02 (late) monitored records and feature
films without files were kept, and studios were not cleaned._

## Running it

`node scripts/whisparr-cleanup.mjs` prints the plan; `--studio <stashdb-id>` narrows it to one
studio; `--apply` runs it on the server in the background and the script prints progress.
Each run starts with Whisparr's `Backup` command and stops if it does not complete. Scene
deletes go 100 at a time, 5 s apart; studio and performer deletes one at a time, and five failures in a row stop
the run. With `--studio`, only that studio's scene records and then the studio itself; with `--performer`,
only that performer, if no scene names them.

`GET /api/whisparr/cleanup` is the status; `POST /api/whisparr/cleanup {apply?, studio?}`
previews or starts (409 while one runs).

## Verified (2026-11-02)

One studio first: 31 file-less records deleted after a completed Backup, `RefreshStudios`
completed, **0 came back**, and its 4 records with files were untouched. An unmonitored studio's
refresh does not re-learn deleted scenes ([[whisparr-unwatched-studios-stop-learning-scenes]]).

Widened run (2026-11-02, late): the studio delete tested first on one empty studio (gone, scene
records and files unchanged), then in full: 10 scene records and 1,270 studios deleted, 0
failures. Whisparr then held 2,707 scene records (2,683 with files, 24 downloading or waiting
Gets) and 125 studios.

Performer run (2026-11-02, late): 5,124 deleted, 0 failures, 1,711 left. It also took 5 feature
film records with it (files untouched); the credit check was added afterwards and the 5 records
were restored with `--restore-film`.
