---
title: StashDB mirror, rate limiter and the paced Get queue
kind: architecture
summary: One rate-limited queue for every StashDB call, a Postgres mirror so each record is fetched once, and the paced queue that fetches picked scenes through Whisparr one at a time.
tags: [stashdb, whisparr, caching, architecture, downloads]
status: current
verified: 2026-11-02
updated: 2026-11-02
code: [apps/server/src/stashdb.ts, apps/server/src/catalog.ts, apps/server/src/getqueue.ts, apps/server/src/db/schema.ts, apps/server/src/api.ts]
related: [stashdb, discover, whisparr-unwatched-studios-stop-learning-scenes, whisparr-sync, whisparr-nothing-monitored, caching, whisparr-shelf]
---

# StashDB mirror, rate limiter and the paced Get queue

The user asked (2026-11-02) for a client that is "extremely API friendly": rate-limited and
caching aggressively, with a local mirror. This page is how flix talks to StashDB and how picked
scenes reach Whisparr. The UI on top is [[discover]]; the Whisparr side is [[whisparr-sync]].

## The rate limiter (`stashdb.ts`)

- One queue for every StashDB request: **one in flight**, request starts at least **1.1 s** apart.
- 429 or 503: wait `Retry-After` when given, else 5 s, 15 s, 60 s, then give up that call.
- **5 consecutive failures pause all StashDB calls for 5 minutes**; calls during the pause fail
  at once with the pause time, so nothing piles up.
- Counters at `GET /api/admin/stashdb` (requests, throttled, failures, pausedUntil, lastError).
  `GET /api/admin/stashdb/type/:name` introspects a schema type through the same queue.

## The mirror (`catalog.ts`, Postgres)

| Table | Holds | Fresh for |
|---|---|---|
| `sdb_scenes` | every scene StashDB returned: title, date, duration, studio, performers, tags, cover, created/updated | until a newer copy arrives |
| `sdb_entities` | performer, studio and tag names (learned free from scenes), image and scene count | 7 days (fetched once when only the name is known) |
| `sdb_scopes` | a performer or studio copied whole: total, `complete`, newest `updated` | re-checked after 20 h |
| `sdb_queries` | a query page's scene ids and total | 24 h; trending 6 h |

- **Scopes**: opening Discover on one performer or studio queues a background copy when it has
  at most **1,500** scenes (100 a page, oldest work first). Afterwards only changes are asked
  for: sorted by `UPDATED_AT`, newest first, stopping at the first change already held. Pages of a
  complete scope are answered from Postgres (`source: 'mirror'`).
- **Everything else** (keywords, categories, several studios, bigger catalogues, trending) is
  asked of StashDB once per page and kept (`source: 'stashdb'`).
- Name search for the filter picker is cached 24 h per term, at most 12 answers.
- Labels come from local state only: owned (Stash's StashDB ids), Whisparr's list (waiting,
  downloading, downloaded), the Get queue, Whisparr's import exclusions (1 h cache, dropped by a delete; discovery reads them fresh and
  skips them, [[deleted-scenes-never-refetched-automatically]]). Blocked
  performers and studios are left out unless `unblocked=1` (`hidden` counts them).

## Getting (`getqueue.ts`)

- **Get queue** (`get_queue`): a selection of up to 200 joins the queue
  (`POST /api/whisparr/get-many`, 202). One scene every **8 s**, each the single-scene Get
  (add or monitor that scene, one search), recorded in `whisparr_gets`. A failure is retried on
  the next drain (60 s after start, then every 10 min), **3 attempts**. Survives restarts.
- **Waiting**: a fetched scene with no file. Whisparr only watches RSS, so flix searches each
  again **7 days** after its last search, at most 5 an hour. "Search again" by hand is refused
  within an hour of the last search. "Give up" unmonitors it and forgets it.
- **Discovery** (`discoverNew`): for each followed performer and studio (Stash favourites minus
  the blocklist), the scenes released since its follow start (less 14 days), through the mirror;
  anything not owned, not in Whisparr with a file or monitored, never deleted and not blocked is
  queued. Daily while the Settings switch is on; `POST /api/discover/run` runs it by hand.

## Endpoints

`GET /api/discover` (q, performers, studios, tags, sort `date|added|trending`, page ≤ 200,
unblocked), `GET /api/discover/names?kind&q`, `GET /api/discover/entity/:kind/:id`,
`GET /api/discover/from/:kind/:libraryId` (StashDB ids of a library performer or studio),
`POST /api/discover/run`, `POST /api/whisparr/get-many`, `GET /api/whisparr/waiting`,
`GET /api/whisparr/queue-status`, `POST /api/whisparr/waiting/:movieId/search`,
`DELETE /api/whisparr/waiting/:movieId`, `DELETE /api/whisparr/queue/:stashdbId`.
