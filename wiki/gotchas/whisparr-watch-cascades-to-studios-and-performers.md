---
title: Watching one performer makes Whisparr watch their studios and co-performers too
kind: gotcha
summary: Refreshing a monitored performer, Whisparr adds their studios and co-performers with the same flags and tags, and their old scenes arrive monitored.
tags: [whisparr, sync, monitoring]
symptom: "watched studios and performers keep growing after a sync; tagged flix but not followed"
found: 2026-11-02
status: current
verified: 2026-11-02
updated: 2026-11-02
code: [apps/server/src/sync.ts]
related: [whisparr-sync, whisparr-nothing-monitored]
---

# Watching one performer makes Whisparr watch their studios and co-performers too

## Symptom

Right after a sync that left 31 performers and 12 studios watched (all followed), Whisparr
showed 84 performers and 65 studios watched, every one carrying the `flix` tag, and 220 scenes
monitored, released from 2014 on. During the same half hour Whisparr grew from 232 to 790
studios and to 21,863 scenes, with `RefreshPerformers` running.

## Cause

A monitored performer's refresh pulls their scenes from StashDB; for each scene Whisparr adds
the studio and the other performers it does not know yet, copying the performer's
`monitored`, `whisparrMonitorNewItems` and **tags**. Those new entries' scenes arrive as "new
items", so they are monitored whatever their release date.

## Fix

The sync turns everything that is not followed off on every run, whatever its tag, and trims
monitored scenes released before the watch start. Its safety check ("would watch far fewer than
before") counts flix's own `whisparr_watch` rows, not tagged entries; counting tags made the
next run look like a collapse (43 wanted against 149 tagged) and refuse.

## Avoid

- Never decide what flix owns from a Whisparr tag; Whisparr copies tags.
- Between a refresh and the next sync the cascade is live: keep the Settings switch on (a run
  every 15 minutes) or run `scripts/whisparr-sync.mjs --apply` after following someone new.
