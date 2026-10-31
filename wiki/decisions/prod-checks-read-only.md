---
title: Headless checks never write to Stash or Whisparr
kind: decision
summary: The check scripts block every write that would leave a trace (plays, activity, deletes, Get, marker, O, rating), and pointing Vite at production is allowed only for those scripts, never for clicking through by hand.
tags: [testing, safety, stash, whisparr, workflow]
status: current
decided: 2026-10-30
by: agent, confirmed by user
verified: 2026-10-30
updated: 2026-10-30
related: [mobile-checks, check-scripts-wrote-plays-to-stash, dev-setup, private-session]
---

# Headless checks never write to Stash or Whisparr

**Decided** 2026-10-30 (agent, confirmed by the user). **Status** current.

## Context

An unblocked headless run once recorded real plays in Stash, and the reset
(`DELETE /api/history/<id>`) needed the user's approval
([[check-scripts-wrote-plays-to-stash]]). Later rounds added writes that are easier to trigger
by accident: Get on the Whisparr shelf, the hold-to-mark gesture, O and rating.

## Decision

`scripts/mobile-check.mjs`, `touch-check.mjs` and `card-check.mjs` intercept and log, without
sending: `POST /api/scenes/:id/play`, `/activity`, `/o`, `/markers`, `PUT …/rating`,
`POST /api/scenes/delete`, and both `/api/whisparr/get*` routes. A gesture test proves the
attempt from the log.

`FLIX_SERVER=http://flix.lan` lets the dev Vite proxy `/api` and `/media` to production when
no local BFF runs. It is for the check scripts only; never click through a production-backed
dev UI by hand, because anything the scripts do not block (favourites, playlists, edits) would
land in the real database.

## Consequences

- A new write route must be added to the block list in the check scripts in the same commit.
- Prefer the dev BFF with the local Postgres ([[dev-setup]]); station test runs still write
  `station_resume` rows there, so clear them afterwards.

## Revisit if

A write-capable staging Stash exists.
