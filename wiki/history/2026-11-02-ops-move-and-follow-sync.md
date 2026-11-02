---
title: "2026-11-02: Stash and Whisparr operations moved here, library names kept out of git, follow sync built"
kind: history
summary: The nas repo's Stash and Whisparr clients, config and notes moved into flix (named content in gitignored private/), a privacy check added, and following a performer now makes Whisparr watch their new releases.
tags: [history, stash, whisparr, sync, privacy]
date: 2026-11-02
commits: [5ca1bff, ca3518c]
status: record
verified: 2026-11-02
updated: 2026-11-02
related: [whisparr-sync, stash-and-whisparr-clients, github-public-mirror, whisparr-nothing-monitored]
---

# 2026-11-02: Stash and Whisparr operations moved here, library names kept out of git, follow sync built

## What changed

- **Clients**: the nas repo's `stash.py` and `arr.py` (as `whisparr.py`, Whisparr only) with
  their stdlib library now live in `scripts/`, reading flix's `.env` names
  ([[stash-and-whisparr-clients]]). Not yet run live from flix: `.env` has no keys yet.
- **Notes and config**: the Stash and Whisparr service pages, two gotchas, two runbooks, three
  history pages, the Whisparr config snapshot and the browser filter moved to the gitignored
  `private/` (they name performers, studios and indexers). `wiki.mjs` loads, indexes and lints
  them locally and refuses links to them from tracked pages. The nas folder was left as it was
  (it has no git; the user chose not to touch it).
- **Privacy**: `scripts/privacy-check.mjs` (in `check.mjs`) fails on any of 5,645 library names
  in a tracked file; 12 existing mentions were replaced ([[github-public-mirror]]).
- **Follow sync** ([[whisparr-sync]]): follow → Whisparr monitors new releases, unfollow and
  block → unmonitored, watch state on the performer page and in Settings. Rule 9 narrowed
  ([[whisparr-nothing-monitored]]).

## How it was verified

- `check.mjs`: typecheck, web tsc, lint baseline, 124 tests (15 new for the planner), privacy.
- Production, sync off: one run planned "0 to watch, 30 to tag, 0 to unmonitor" plus 55
  performers set by hand. Switched on: the `flix` tag was created and the 30 followed performers
  tagged; monitored scenes stayed at 330, no command started.
- iPhone-size headless check: the Settings panel, and the performer page's "Watching for new
  scenes" line; the buttons below stay put while it loads (space held for followed performers).

## Snags

- The first combined commit was blocked from the public mirror because ported pages named
  library content; that led to `private/` and the privacy check.
- Pointing the copied clients at the nas repo's `.env` was blocked (rule 7); the clients wait
  for flix's own keys.
- Whisparr's bulk `performer/editor` returns 400 over one performer's stale root folder; the
  sync writes performers one by one.
- Whisparr adds new studios and performers with "monitor new items" on: 55 of each arrived the
  same day, plus the user's own studio re-monitoring brought 330 monitored scenes. The sync
  lists such performers as "Set by hand" and changes nothing it does not own.
