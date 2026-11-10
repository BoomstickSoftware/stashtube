---
title: Server (BFF)
kind: architecture
summary: Module map of apps/server, how it runs (Node 26 executes .ts natively, erasable TypeScript), the job registry, how errors and bad input map to HTTP, what the tests cover, and what /healthz and /readyz mean.
tags: [server, hono, node, tests, jobs]
status: current
verified: 2026-11-10
updated: 2026-11-10
code: [apps/server/src/index.ts, apps/server/src/api.ts, apps/server/src/routes, apps/server/src/stash.ts, apps/server/src/stash, apps/server/src/jobs.ts, apps/server/src/errors.ts]
related: [stash-layer, caching, media-proxy, data-model, coding-conventions, run-checks]
---

# Server (BFF)

`apps/server` is a Hono app on Node 26, started as `node src/index.ts`: no build step, Node
runs the TypeScript directly, which is why the code must be erasable ([[coding-conventions]]).
One process serves `/api/*`, `/media/*` and, in production, the built web app (`WEB_DIST`).

## Module map (`apps/server/src/`)

| File | Holds |
|---|---|
| `index.ts` | App assembly, `/healthz`, `/readyz`, CORS for signed media, static web, migrate on boot, the boot warm, `startJobs()` |
| `api.ts`, `routes/*.ts` | `api.ts` only mounts one Hono sub-app per domain: `scenes`, `home` (feed, Featured, pinned rows), `stations`, `history` (and stats), `people` (performers, studios, tags, search), `settings` (and `/features`), `playlists` (and favourites), `curation` (blocklist, Unlisted, Cast, studio defaults), `whisparr` (shelf, guard, cleanup, Get queue), `discover`. `routes/shared.ts` has the zod schemas and the validators (below). 113 routes |
| `home.ts` | Home feed and Featured assembly, cached per visit seed ([[home-feed]], [[featured-ranking]]) |
| `stash.ts`, `stash/*.ts` | The Stash layer: a barrel over thirteen modules; nothing outside `stash/` imports the generated schema ([[stash-layer]]) |
| `stash.schema.ts` | Generated from `stash.schema.graphql` (Stash v0.31.1); 5.5 k lines, never edited by hand ([[regenerate-stash-schema]]) |
| `errors.ts` | `UpstreamError` and the app's error handler (below) |
| `jobs.ts`, `categorySync.ts` | The job registry (below); the hourly Cast and studio-defaults check |
| `guard.ts` | Cross-site writes, foreign host names, security headers, playback CORS origins ([[request-guard]]) |
| `media.ts`, `remote.ts`, `signing.ts`, `files.ts` | `/media/stash/*`, `/media/remote/:token`, `/media/play/:id`; the remote-cover allowlist; HMAC playback and cover tokens; byte ranges through `MEDIA_PATH_MAP` ([[media-proxy]]) |
| `cache/memory.ts`, `cache/data.ts`, `cache/assets.ts` | The query cache class, its one instance `dataCache` (with the `HOME` and `POOL` tags), and the disk asset cache with resized WebP copies ([[caching]]) |
| `warm.ts`, `admin.ts` | Nightly artwork pre-fetch; `GET /api/admin/cache` (cache, upstream and job status), clear, warm ([[cache-admin]]) |
| `featured.ts`, `duplicates.ts`, `rank.ts`, `previews.ts` | Pure: Featured ranking, which duplicate to keep, name-match ranking, station preview seeds |
| `whisparr.ts`, `stashdb.ts`, `catalog.ts` | Whisparr's API ([[whisparr-api]]); StashDB's rate-limited client ([[stashdb]]); the StashDB mirror behind Discover ([[stashdb-mirror]]) |
| `sync.ts`, `getqueue.ts`, `cleanup.ts`, `delete.ts` | The Whisparr guard ([[whisparr-sync]]); the paced Get queue, re-search and discovery; the record cleanup ([[whisparr-cleanup]]); delete through Whisparr, then Stash ([[delete-via-whisparr]]) |
| `cast.ts`, `studioCategories.ts`, `unlisted.ts`, `blocklist.ts`, `continue.ts`, `sweep.ts` | [[cast]], [[studio-default-categories]], [[vault]], [[blocklist-and-exclusions]] (`exclusions()`, `blockedStashDbIds()`), Continue expiry, the ghost sweep |
| `stations.ts`, `playlists.ts`, `rows.ts`, `settings.ts` | Postgres-backed features ([[data-model]]) |
| `auth.ts`, `config.ts`, `conditional.ts` | Optional login ([[optional-login]]); env with defaults ([[config-env]]); ETags on `/api` GETs |
| `db/schema.ts`, `db/index.ts`, `drizzle/` | Drizzle schema, client, migrations ([[database-migrations]]) |

## Errors and bad input

- An upstream that does not answer or refuses throws `UpstreamError` (`source`: `stash`,
  `whisparr` or `stashdb`; `StashError` extends it) and the handler answers **502** with its
  message. _Until 2026-11-10 only Stash's did; a Whisparr or StashDB failure, and a Stash that
  could not be reached at all, were a bare 500._ Anything else is a 500 with no detail.
- A body that is not JSON is a **400** (`body(c)`; _500 until 2026-11-10_).
- Every route that sends a path id to Stash validates it first with `idParam` (digits only,
  400 otherwise); flix's own row ids go through `rowId`. A `RangeError` from `whisparr.ts`,
  `getqueue.ts` or `cleanup.ts` means "refused" and becomes 400 or 409 (`refused()`).
- Route order: a literal path must be registered before the `:id` route beside it
  (`/scenes/facets` before `/scenes/:id`); each such pair lives in one route file, in order.

## Background jobs (`jobs.ts`)

`register({ name, every, firstAfter, run, gate?, persist? })`, at import; `startJobs()` in
`index.ts` schedules them, so a test that imports a module starts no timer. The registry gives
each job an overlap guard (a tick or `trigger()` during a run joins it), status (last run,
error, duration, next run, skipped ticks: `jobs` in `GET /api/admin/cache`), a `gate` asked on
each tick, and with `persist` the last successful run kept in Postgres (`settings` rows
`job:<name>`), so the first run after a restart waits until `every` has passed since it. _Until
2026-11-10 eight modules hand-rolled timers and "daily" meant "five minutes after every deploy"._

| Job | Every | First | Notes |
|---|---|---|---|
| `stash-change-check` | `CHANGE_POLL_SECONDS` | same | gate: flix used in the last 10 min ([[caching]]) |
| `category-sync` | 1 h | 90 s | gate: the library fingerprint differs from the one at the last successful sync, so the hourly **check** is one small query and the three whole-library reads run only after a change ([[cast]], [[studio-default-categories]]) |
| `whisparr-guard` | 15 min | 3 min | persisted; gate `timedRunDue` ([[whisparr-sync]]) |
| `get-queue`, `get-research` | 10 min, 1 h | 1 min, 1 h | a Get also triggers `get-queue` |
| `discovery`, `continue-expiry` | 24 h | 5 min | persisted: daily from the last run |
| `artwork-warm` | 24 h | next `WARM_AT_UTC` | also from Settings |
| `ghost-sweep` | on a Stash change | 2 min | |
| `cache-save`, `asset-access-flush` | 2 min, 10 min | same | |

The Cast and studio-defaults syncs, the guard and the cleanup keep their own "one run at a
time" promise as well, because requests call them directly and wait for the result.

## Health endpoints

- `GET /healthz` → `{ ok: true, version: <GIT_SHA> }`. The deploy waits for its commit here ([[forgejo-ci]]).
- `GET /readyz` → `ok` when Postgres answers, `503` otherwise. It does **not** probe Stash: a
  scan holds Stash's SQLite lock for minutes and must not take flix out of rotation; the caches
  cover it ([[stash-database-locked]]).

## Tests

`node:test` files beside the code (`src/**/*.test.ts`, no test dependencies); `pnpm test`, also
run during the image build. `test-env.ts` supplies the env `config.ts` needs; nothing reaches
Stash, Whisparr or Postgres. **209 tests on 2026-11-10** (_69 on 2026-10-30_). They cover the
pure parts where a mistake would only show as a Stash 500 or a silent miss (the filter
builder, every finder's criterion keys, both caches, byte ranges, signed links, Featured
scoring, the exact Whisparr and StashDB requests) and, since 2026-11-10, where flix deletes
and downloads: `delete.test.ts` (the order of the writes, with stubs), `discovery.test.ts`
(what discovery may fetch, when a catalogue refresh stops, the bound SQL), `routes.test.ts`
(`app.request()`: bad ids and bodies → 400 before anything is sent, upstream failures → 502),
`jobs.test.ts` (overlap, persisted last run, gate), `sync.test.ts` (a scene requested mid-run
is not unmonitored) and `boundaries.test.ts` (only `stash/` imports the schema).
