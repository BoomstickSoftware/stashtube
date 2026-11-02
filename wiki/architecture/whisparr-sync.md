---
title: Whisparr guard (Whisparr monitors only the scenes flix fetched)
kind: architecture
summary: A reconcile loop keeps every Whisparr performer and studio unmonitored and every scene unmonitored unless flix fetched it or it is downloading; follows are flix's own record and drive flix's discovery, not Whisparr's.
tags: [sync, stash, whisparr, architecture]
status: current
verified: 2026-11-02
updated: 2026-11-02
code: [apps/server/src/sync.ts, apps/server/src/getqueue.ts, apps/server/src/whisparr.ts, apps/server/src/api.ts, apps/web/src/components/WhisparrSync.tsx, scripts/whisparr-sync.mjs, apps/server/src/db/schema.ts]
related: [stashdb-mirror, discover, whisparr-cleanup, whisparr-nothing-monitored, stash-owns-activity, people-pages, delete-via-whisparr, whisparr-shelf, blocklist-and-exclusions, settings-page, stash-and-whisparr-clients]
---
# Whisparr guard (Whisparr monitors only the scenes flix fetched)

Built 2026-11-02 as a follow sync that made Whisparr watch favourites; turned into a guard the
same night, when discovery moved to flix ([[whisparr-nothing-monitored]], [[stashdb-mirror]]).

## The rule

| In Whisparr | The guard makes it |
|---|---|
| Any performer or studio with `monitored` or `whisparrMonitorNewItems` on, or the old `flix` tag | both off, tag removed, followed or not |
| A monitored scene flix fetched (`whisparr_gets`) | left alone until its file arrives, then the Get row is dropped |
| A monitored scene downloading or grabbed | left alone |
| Any other monitored scene | unmonitored (`PUT movie/editor`) |

A Get of a scene Whisparr did not hold adds its studio and performers with Whisparr's defaults,
flags on: 3 such after the first discovery run (2026-11-02). The guard turns them off within
15 minutes; nothing is searched meanwhile, since global "monitor new items" is off.

Follows stay Stash favourites. Their start dates (`whisparr_watch`) belong to flix's discovery,
which finds new releases in the StashDB mirror and fetches them one scene at a time
([[stashdb-mirror]] "Getting"). The guard forgets the start date of anything no longer followed
or now blocked. It never starts a search.

## Running it

- `node scripts/whisparr-sync.mjs` (dry run) and `--apply`; `--force` when far fewer follows
  than recorded is right. No keys needed: it calls `POST /api/sync/run` on flix.
- Settings → Library switch: on, a timer applies it 3 min after start, every 15 min, and 10 s
  after a follow or block, and daily discovery runs. Off, the timer only plans and discovery
  runs only from "Find new releases".

## How it stays loosely coupled

- **A click writes one system.** Follow writes the Stash favourite, Block writes Postgres; each
  then calls `kickSync()`, which runs the guard 10 s later in the background. A Whisparr outage
  never fails or slows a click.
- **Reconcile, don't chain.** `runSync()` reads every side each time (Stash favourites, the
  blocklist, the Get rows, Whisparr's performers, studios, scenes and activity, read fresh, not
  from the 15-min list cache); `planSync()` (pure, tested) works out the difference. A failed
  run is repeated by the next. One run at a time.
- **No answer is never "nothing".** Stash, Postgres or Whisparr failing to answer skips the run
  with a reason; the favourites read is uncached.
- **Bounded.** A run that finds under half as many follows as recorded start dates (4 or more)
  is refused unless `--force`: that looks like Stash answering wrongly, and would forget dates.
  Turning things off is otherwise unlimited, since it cannot start a download.
- **Writes** are one at a time for performers and studios (GET, change flags, PUT); scenes in
  one editor call. A failed write is shown against its name; the next run retries.

## Endpoints

`GET /api/sync` (last run: outcome, detail, items, follows, scenes unmonitored),
`POST /api/sync/run` (no body: follows the switch; `{apply, force}`: the script),
`GET /api/whisparr/watch/performer/:id` (`{watching, managed, downloading}`: watching means
followed while the switch is on).

## Considered and declined (2026-11-02)

| Workflow | Why not |
|---|---|
| "Not interested" or 1 star → import exclusion | The scene is owned already; Delete adds the exclusion |
| Ratings, plays, O → Whisparr | Whisparr has no use for them |
| Whisparr import → Stash | Already done by Whisparr's own Stash connection (Scan, then Identify) |
| Delete → import exclusion | Already done (`deleteMovie` passes `addImportExclusion=true`), which keeps RSS from grabbing a deleted new release again |
| StashDB favourites | Unused |
