---
title: Whisparr monitors nothing; downloads are chosen one scene at a time
kind: decision
summary: Whisparr monitors nothing but the favourite performers, for new releases only; flix asks for one scene per click and never monitors a studio or performer.
tags: [whisparr, downloads, policy]
status: current
decided: 2026-10-28
by: user
verified: 2026-11-02
updated: 2026-11-02
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
as scenes, and a torrent indexer tripped its backoff. Studios added in the UI default to
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

## Drift and resets

By 2026-11-02 the library had grown to 179 studios, with 10 monitored and 146 with new-item
monitoring on, and 4,847 of 14,881 scenes monitored (4,616 of them missing). At the user's
request every studio was set `monitored=false whisparrMonitorNewItems=false` (`arr.py
whisparr3 set studio/<id> … --apply`, backup on the first write only). Result: 0 of 178
studios monitored, 0 with new items on. The same day the user asked for everything unmonitored:
`PUT movie/editor {movieIds, monitored:false}` took 4,843 scenes and 1 feature film to 0 of
14,878 monitored. No performer was monitored, but all 5,322 had `whisparrMonitorNewItems`
on; `PUT performer/editor` fails with HTTP 400 "Root folder '/volume1/Media/adult/movies'
does not exist", so the flag was cleared one performer at a time (`arr.py whisparr3 set
performer/<id> whisparrMonitorNewItems=false --apply --no-backup`, ~1.5 s each, 4 in
parallel). One performer kept the same 400 because its own `rootFolderPath` was the retired
`/volume1/Media/adult/movies`; setting it to `/volume1/Media/adult` with the flag fixed it.
Result: 0 of 5,322 performers monitored or adding new items. The user then re-monitors a few studios by hand. Studios 203 and 143 disappeared from Whisparr during the runs; nothing here
deleted them.

## Exception: favourite performers watch for new scenes (2026-11-02)

The user asked for their favourite performers (Stash favourites, the heart in flix; 30 on
2026-11-02) to be "monitored for all new scenes". Each was matched to its Whisparr performer
by StashDB id and set `monitored=true whisparrMonitorNewItems=true`. Tested on one performer
first: no existing scene became monitored, no command or search started, the queue did not
grow. So the back catalogue stays unmonitored and only releases found after the change are
monitored and grabbed by RSS.

- The set is fixed at the moment of the change. Following a performer in flix does **not**
  monitor them in Whisparr; flix still has no such code path (rule 9 of CLAUDE.md), so a new
  favourite is added in Whisparr by hand.
- Their quality profiles were left as they were: 22 on profile 1 "Any" (no upgrades,
  prefers 2160p), 8 on profile 4 "HD-1080p". New grabs take the performer's profile.
- Studios, scenes and every other performer stay unmonitored.

## Revisit if

The user asks to monitor something; even then, prefer per-scene monitoring.
