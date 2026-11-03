---
title: Deleting a Whisparr performer deletes the records of feature films they are credited on
kind: gotcha
summary: A feature film lists its cast only in Whisparr's credits, not in performerForeignIds, and deleting a credited performer deletes the film's record (not its file); the cleanup now keeps every credited performer.
tags: [whisparr, cleanup, performers, films]
symptom: "MovieService Deleted movie <film> while deleting performers; the film's file is still on disk"
found: 2026-11-02
status: current
verified: 2026-11-02
updated: 2026-11-02
related: [whisparr-cleanup]
---

# Deleting a Whisparr performer deletes credited films' records

## Symptom

During the performer cleanup ([[whisparr-cleanup]]), 5,124 performers that no scene record named
were deleted with `DELETE /performer/:id?deleteFiles=false`. Whisparr's log showed five
`MovieService Deleted movie …` lines in the same minutes, all feature films with files; records
with files went from 2,683 to 2,678. The five files were still on the NAS (checked with `ls`
over SSH, and Stash read four of them).

## Cause

Scene records carry their performers in `performerForeignIds` and `performerNames`; feature
films (`itemType: 'movie'`) keep their cast only in `GET /api/v3/credit?movieId=<id>` (each
credit has Whisparr's `performerId`). 6 of the 18 remaining films had empty
`performerForeignIds`. Deleting a performer removes the records credited to them; the
`deleteFiles=false` flag kept the files.

## Fix

- The cleanup keeps any performer credited on a remaining film, or on a record with names but
  no ids (`creditsOf` in `cleanup.ts`), besides those named by id or name.
- A lost film record is put back at its folder with
  `node scripts/whisparr-cleanup.mjs --restore-film <tmdbId> <path>`: the record is looked up
  by TMDB id (the bracketed number in the log line), added unmonitored with no search at that
  path, and rescanned so Whisparr links the file.
