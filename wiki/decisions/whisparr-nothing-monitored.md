---
title: Whisparr monitors nothing; downloads are chosen one scene at a time
kind: decision
summary: Every Whisparr studio, performer and scene stays unmonitored and flix only ever asks for one scene per click; no studio- or performer-wide monitoring or search exists anywhere.
tags: [whisparr, downloads, policy]
status: current
decided: 2026-10-28
by: user
verified: 2026-10-30
updated: 2026-10-30
related: [whisparr-shelf, whisparr-api, stashdb]
sources: [nas:docs/known-issues.md, nas:CLAUDE.md]
---

# Whisparr monitors nothing; downloads are chosen one scene at a time

**Decided** 2026-10-28 by the user, reaffirmed 2026-10-30 ("unmonitor everything, without
deleting any files"). **Status** current. The NAS repo's "Media library policy" rule 4 and
known-issues #40 hold the operational side.

## Context

On 2026-10-28 two bulk `MoviesSearch` commands of 1,000 ids ran for hours and held up every
import; the queue grew to ~1,100 grabs (2.76 TB against 4.1 TB free), image sets were grabbed
as scenes, and the IPTorrents indexer tripped its backoff. Studios added in the UI default to
monitored and silently bring hundreds of missing scenes; 10 came back monitored by 2026-10-29.

## Decision

0 studios, 0 performers, 0 scenes monitored, new-items monitoring off everywhere. The user
picks what to download, by hand in Whisparr or one scene at a time from flix
([[whisparr-shelf]]): StashDB is the catalogue, Whisparr the executor.

## Consequences

- flix has **no code path** that monitors or searches a performer or studio. Both Get routes
  refuse anything but a single scene id (feature films too), and the tests pin the exact
  requests.
- Never re-enable studio monitoring or run a studio-wide search, even to "fill a gap".
- Expect the shelf to be the main way new scenes arrive.
- Open question (nas known-issues #40): whether the daily `RefreshStudios` still adds newly
  released scenes to a studio with new-items off; baseline 9,363 scenes / 36 studios at
  2026-10-30 17:00 UTC.

## Revisit if

The user asks to monitor something; even then, prefer per-scene monitoring.
