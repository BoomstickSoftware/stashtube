---
title: Follow sync (flix, Stash and Whisparr)
kind: architecture
summary: Following a performer makes Whisparr watch their new releases and blocking unmonitors, through a guarded reconcile loop no outage can break; plus the declined workflows.
tags: [sync, stash, whisparr, architecture]
status: current
verified: 2026-11-02
updated: 2026-11-02
code: [apps/server/src/sync.ts, apps/server/src/whisparr.ts, apps/server/src/api.ts, apps/web/src/components/WhisparrSync.tsx]
related: [whisparr-nothing-monitored, stash-owns-activity, people-pages, delete-via-whisparr, whisparr-shelf, blocklist-and-exclusions, settings-page, stash-and-whisparr-clients]
---

# Follow sync (flix, Stash and Whisparr)

Built 2026-11-02 from the user's choice of workflows ([[whisparr-nothing-monitored]]).

## What it does

| You do (in flix or Stash's UI) | Whisparr ends up |
|---|---|
| Follow a performer (Stash favourite) | that performer `monitored` + `whisparrMonitorNewItems`, tagged `flix`: new releases are added monitored and RSS grabs them. Older scenes stay unmonitored; no search is ever started |
| Unfollow | the performer unmonitored, both flags off, tag removed |
| Block a performer or studio | unmonitored, even if it was set by hand in Whisparr (blocked beats followed) |
| Monitor someone by hand in Whisparr | left alone and listed as "Set by hand" |
| Follow someone Whisparr does not know | listed as "Not in Whisparr"; add them there (adding by API is untested) |

Settings → Library → "Watch followed performers for new scenes" turns writing on (setting
`whisparrSync`, off by default). Off, every run only plans, and the panel shows the plan. The
performer page shows "Watching for new scenes · N downloading" under the facts line.

## How it stays loosely coupled

- **A click writes one system.** Follow writes the Stash favourite, Block writes Postgres; each
  then calls `kickSync()`, which runs the sync 10 s later in the background. A Whisparr outage
  never fails or slows a click.
- **Reconcile, don't chain.** `runSync()` reads all three sides each time (Stash favourites,
  the blocklist, Whisparr's performers, studios and tags), `planSync()` (pure, tested) works
  out the difference, and only that is written. A failed run is repeated by the next: 3 min
  after start, every 15 min, and after each kick. One run at a time.
- **No answer is never "nothing".** Stash, Postgres or Whisparr failing to answer skips the run
  with a reason; the favourites read is uncached so an outage cannot pass for an empty list.
- **Bounded.** More than 20 monitoring changes in one run, or dropping over half of the
  watched performers at once (with 4 or more watched), is refused and shown, not applied.
  Tagging performers that are already watched does not count.
- **Ownership.** Only performers tagged `flix` are ever unmonitored for being unfollowed.
- **Writes** are one at a time: GET the object, change the flags and tags, PUT it back; no
  command, so no search. A failed write is shown against its name; the next run retries.

## Endpoints

`GET /api/sync` (last run: outcome, detail, items, how many watched), `POST /api/sync/run`
(run now; applies only when the switch is on), `GET /api/whisparr/watch/performer/:id`
(`{watching, managed, downloading}`; Whisparr down reads as not watching).

## Considered and declined (2026-11-02)

| Workflow | Why not |
|---|---|
| Follow a studio → monitor it | Studios publish far more; the October bulk-search incident began with monitored studios. Declined by the user |
| "Not interested" or 1 star → import exclusion | The scene is owned already; Delete adds the exclusion |
| Ratings, plays, O → Whisparr | Whisparr has no use for them |
| Whisparr import → Stash | Already done by Whisparr's own Stash connection (Scan, then Identify) |
| Delete → import exclusion | Already done (`deleteMovie` passes `addImportExclusion=true`), which keeps RSS from grabbing a deleted new release again |
| StashDB favourites | Unused |

## Open

- `afterDate` (limit a performer to releases after a date) is not set; the two flags alone were
  verified not to monitor older scenes.
- Followed performers' quality profiles are left as they are (most are "Any").
- Adding a performer Whisparr lacks is manual.
