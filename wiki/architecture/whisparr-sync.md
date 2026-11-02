---
title: Whisparr sync (Stash favourites decide what Whisparr monitors)
kind: architecture
summary: Stash favourite performers and studios are watched for new releases, everything else in Whisparr is unmonitored and old scenes are trimmed, by a guarded reconcile loop run from a script or a timer.
tags: [sync, stash, whisparr, architecture]
status: current
verified: 2026-11-02
updated: 2026-11-02
code: [apps/server/src/sync.ts, apps/server/src/whisparr.ts, apps/server/src/api.ts, apps/web/src/components/WhisparrSync.tsx, scripts/whisparr-sync.mjs, apps/server/src/db/schema.ts]
related: [whisparr-nothing-monitored, stash-owns-activity, people-pages, delete-via-whisparr, whisparr-shelf, blocklist-and-exclusions, settings-page, stash-and-whisparr-clients]
---

# Whisparr sync (Stash favourites decide what Whisparr monitors)

Built 2026-11-02; widened the same evening to studios and to "everything else off"
([[whisparr-nothing-monitored]]).

## The rule

| In Stash / flix | Whisparr ends up |
|---|---|
| Favourite performer or studio (the heart; Stash's own UI too) | `monitored` + `whisparrMonitorNewItems`, tagged `flix`; watch start recorded |
| Anything else, including what Whisparr adds on its own with "new items" on | both flags off, tag removed |
| Blocked in flix | off, even if it is a favourite |
| A monitored scene that is a Get from flix, or downloading or grabbed | left alone |
| A monitored scene of a watched one, released after its watch start (less 14 days) | left alone: a real new release |
| Any other monitored scene | unmonitored (`PUT movie/editor`, 500 at a time) |
| A favourite Whisparr does not know | listed, to add in Whisparr |

Why scenes are trimmed: Whisparr's "monitor new items" monitors every scene it newly learns
about, old ones included (a newly watched studio's whole catalogue), and `afterDate` is untested.

## Running it

- `node scripts/whisparr-sync.mjs` (dry run) and `--apply`; `--force` when it would watch far
  fewer than before on purpose. No keys needed: it calls `POST /api/sync/run` on flix.
- Settings → Library switch: on, a timer applies it 3 min after start, every 15 min, and 10 s
  after a follow or block. Off (since the evening of 2026-11-02), the timer only plans.

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
- **Bounded.** The timer will not start watching more than 20 at once (the script may). Any
  run that would watch under half of what was watched (with 4 or more) is refused unless
  `--force`: that looks like Stash answering wrongly. Turning things off is otherwise
  unlimited, since it cannot start a download.
- **What flix watches is its own record** (`whisparr_watch`), never the `flix` tag: Whisparr
  copies tags and flags to the studios and co-performers it adds while refreshing a watched
  performer ([[whisparr-watch-cascades-to-studios-and-performers]]).
- **Order**: performers and studios off first, then scenes, then on, so a failure part-way
  leaves less monitored, not more. Watch starts are written before anything is turned on.
- **Writes** are one at a time: GET the object, change the flags and tags, PUT it back; no
  command, so no search. A failed write is shown against its name; the next run retries.

## Endpoints

`GET /api/sync` (last run: outcome, detail, items, how many watched, scenes trimmed),
`POST /api/sync/run` (no body: follows the switch; `{apply, force}`: the script), `GET /api/whisparr/watch/performer/:id`
(`{watching, managed, downloading}`; Whisparr down reads as not watching).

## Considered and declined (2026-11-02)

| Workflow | Why not |
|---|---|
| "Not interested" or 1 star → import exclusion | The scene is owned already; Delete adds the exclusion |
| Ratings, plays, O → Whisparr | Whisparr has no use for them |
| Whisparr import → Stash | Already done by Whisparr's own Stash connection (Scan, then Identify) |
| Delete → import exclusion | Already done (`deleteMovie` passes `addImportExclusion=true`), which keeps RSS from grabbing a deleted new release again |
| StashDB favourites | Unused |

## Open

- `afterDate` is not used; the scene trim does its job. Between Whisparr adding a catalogue and
  the next run, RSS could grab an old scene; runs are on request now, so run the script after
  following a new studio.
- Followed performers' quality profiles are left as they are (most are "Any").
- Adding a performer Whisparr lacks is manual.
- **Proposed 2026-11-02, not built: watch StashDB instead of monitoring in Whisparr.** flix
  would poll StashDB for followed performers' and studios' scenes released after their watch
  start, not in Stash and not in Whisparr, and Get each one (the existing single-scene path).
  Whisparr would then monitor single scenes only: no performer or studio monitoring, no cascade,
  no trimming, no database growth. Unwatched studios Whisparr never refreshes are already
  browsable through the shelf ([[whisparr-unwatched-studios-stop-learning-scenes]]).
