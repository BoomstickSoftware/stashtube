---
title: Whisparr monitors nothing; downloads are chosen one scene at a time
kind: decision
summary: Whisparr monitors only the scenes flix fetched; every performer and studio stays unmonitored; flix finds followed ones' new releases on StashDB and fetches each scene with one search.
tags: [whisparr, downloads, policy]
status: current
decided: 2026-10-28
by: user
verified: 2026-11-02
updated: 2026-11-02
related: [whisparr-shelf, whisparr-api, stashdb, stashdb-mirror, whisparr-sync, discover]
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

- flix never **searches** a performer or studio. Both Get routes refuse anything but a single
  scene id (feature films too), and the tests pin the exact requests. Since 2026-11-02 its one
  monitoring path is the follow sync below, for new releases of followed performers only.
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

- _Was_ a fixed set needing hand upkeep; superseded the same day by the follow sync below.
- Their quality profiles were left as they were: 22 on profile 1 "Any" (no upgrades,
  prefers 2160p), 8 on profile 4 "HD-1080p". New grabs take the performer's profile.
- Studios, scenes and every other performer stay unmonitored.

## Revisit if

The user asks to monitor something; even then, prefer per-scene monitoring.

## Follows are synced (2026-11-02)

The user chose to build three workflows from [[whisparr-sync]]: **following a performer monitors
their new releases** in Whisparr (unfollowing stops it), **blocking unmonitors** a performer or
studio, and the watch state shows in flix. Rule 9 of `CLAUDE.md` narrowed accordingly:

- The only monitoring flix does is `monitored` + `whisparrMonitorNewItems` on performers it tags
  `flix`, from Stash favourites minus the blocklist; never a back catalogue, never a search
  command, never a studio turned on (blocked studios are only turned off).
- Studios stay unmonitored (the user declined "follow a studio monitors it").
- A Settings switch, off by default, turns writing on; off, the sync only plans.

## Favourites decide everything (2026-11-02, evening)

The user asked for a script that unmonitors everything in Whisparr and then watches the new
releases of the **favourite performers and studios** in Stash, to run on request. Built as the
same sync with a wider rule (studios included, everything else off, old scenes trimmed) and
`scripts/whisparr-sync.mjs` to run it. This reverses the earlier "follow a studio: no".

Found the same day: Whisparr's "monitor new items" also monitors **old** scenes it learns about
later. 54 studios Whisparr added with that flag on had all 106 of their scenes (2015 onwards)
monitored, and 7 studios monitored by hand brought 1,028; 1,170 monitored scenes in all, nearly
all old and missing. `afterDate` is unset everywhere and untested. So the sync keeps a watch-start
date per performer and studio (`whisparr_watch`) and unmonitors their scenes released more than
14 days before it; Gets from flix (`whisparr_gets`) and downloads in progress are never touched.
The automatic timer was switched off for the change; runs are by the script unless the user
turns the Settings switch back on.

## Discovery and fetching split (2026-11-02, night)

The user switched Whisparr's global "monitor new items" off: followed performers and studios
discover their new scenes unmonitored, and nothing downloads on its own. flix's sync now Gets each
new release of a followed one (one scene, one search), and the user asked to go on with a
StashDB-backed Discover page in flix, paced multi-scene Get, and a cleanup of what Whisparr holds
but never fetched. All downloads are now single-scene Gets, by a click or by the sync.

## Only fetched scenes are monitored (2026-11-02, night)

The user confirmed the end state: "the only thing in whisparr that is actually monitored is
scenes". Every performer and studio in Whisparr is unmonitored, followed ones too, so refreshes
no longer cascade flags or grow the database. A scene is monitored only when flix fetched it
(a Get, a Discover selection, or discovery of a followed one's new release), so Whisparr keeps
watching RSS for it until a release turns up; flix searches each again weekly. The client must
be "extremely API friendly": every StashDB call goes through one rate-limited queue and what it
returns is kept in a local mirror ([[stashdb-mirror]]). Picked scenes are fetched one every 8 s.
