---
title: "2026-10-30: Whisparr from flix, then the StashDB catalogue behind the shelf"
kind: history
summary: Phases 2l and 2q: a "Not in your library yet" shelf with a single-scene Get through Whisparr, then StashDB's full catalogue behind it with remote scenes added one at a time; nothing ever monitors a studio.
tags: [history, whisparr, stashdb, downloads]
date: 2026-10-30
commits: [79a0d95, d28b7c6]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [whisparr-shelf, whisparr-nothing-monitored, stashdb, whisparr-api]
---

# 2026-10-30: Whisparr from flix, then the StashDB catalogue behind the shelf

## What changed

- **2l** (79a0d95): with `WHISPARR_URL` and `WHISPARR_API_KEY` set, performer and studio pages
  show the scenes Whisparr lists for them without a file (matched by StashDB id, newest
  first, with the state from Whisparr's queue and last grabs); Home gets "New from your
  favourites, not downloaded" from three items. One button per card, **Get**, monitors that
  scene and runs `MoviesSearch` for it alone; the server refuses any other id shape and
  feature films. The 25 MB movie list is cached 2 min in memory → [[whisparr-shelf]].
- The policy that nothing is monitored and downloads are chosen by hand
  ([[whisparr-nothing-monitored]]) was re-applied on the NAS the same afternoon: 0/36
  studios, 0/9,363 scenes monitored.
- **2q** (d28b7c6): `stashdb.ts` reads a performer's or studio's whole scene list from StashDB
  (Stash's own stash-box key from its configuration; `STASHDB_*` overrides), 24 a page with
  "Show more"; each scene is labelled already-in-Stash (dropped), in Whisparr (its state) or
  remote. Get on a remote scene adds that one scene to Whisparr
  (`movie/lookup?term=stash:<uuid>` → `POST movie` with `searchForMovie`), placed like its
  studio siblings; a scene Whisparr already lists takes the monitor-and-search path. Without
  StashDB the shelf is Whisparr's list (`source` says which) → [[stashdb]], [[whisparr-api]].

## How it was verified

`whisparr.test.ts` and `stashdb.test.ts` pin the exact requests; read-only checks of
Whisparr with the nas repo's `arr.py whisparr3 get movie|studio|queue --json`;
`scripts/mobile-check.mjs` blocks both get routes.

## Snags

- Whisparr's calendar was empty, so "Coming soon" became recent releases
  ([[whisparr-calendar-empty]]).
- While wiring the shelf, 10 studios were found monitored again (added 2026-10-29 in the UI,
  which defaults to monitored); the user had them unmonitored. Open question in [[roadmap]]:
  does the daily `RefreshStudios` still add new scenes to a studio with new-items off.
