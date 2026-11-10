---
title: Stash layer (stash/ and the generated schema)
kind: architecture
summary: Only the stash/ modules behind the stash.ts barrel know Stash's GraphQL schema (pinned by a test); its types are generated from Stash's own schema, so an unknown criterion is a compile error.
tags: [stash, graphql, codegen, server]
status: current
verified: 2026-11-10
updated: 2026-11-10
code: [apps/server/src/stash.ts, apps/server/src/stash, apps/server/src/stash.schema.ts, apps/server/stash.schema.graphql, apps/server/codegen.ts, apps/server/src/boundaries.test.ts, apps/server/src/finders.test.ts]
related: [stash-api, regenerate-stash-schema, stash-filters-have-no-id-criterion, blocklist-and-exclusions, caching, server-bff]
---

# Stash layer (`stash/` and the generated schema)

`apps/server/src/stash/` holds every Stash GraphQL call and the Stash→flix mapping onto the
[[shared-contract]] types. `apps/server/src/stash.ts` is a barrel that re-exports its public
names; the rest of the server imports from the barrel. **Nothing outside `stash/` imports
`stash.schema.ts`**: `boundaries.test.ts` fails if a file does. A route or feature module that
needs something Stash-shaped asks for a function that returns `@flix/shared` types or plain
values (`findPerformers(filter, { only, gender })`, `featuredCandidates()`, `getScene()`'s
`parentStudioId`). _Until 2026-11-10 it was one 1,790-line file, and `api.ts` and `settings.ts`
built criteria and mapped raw scenes themselves._ The web never sees a Stash shape.

## Modules (`stash/`)

| File | Holds |
|---|---|
| `client.ts` | `gql` (uncached, lock retries, 60 s timeout), `query`, `computed`, `mutate`, `StashError`, the `upstream` counters, `stashFetch` |
| `changes.ts` | the change fingerprint, `checkForChanges`, `WarmDebounce`, `noteActivity`, `acceptOwnChanges` ([[caching]]) |
| `mappers.ts` | the fragments (`SCENE_CARD`, `SCENE_DETAIL`, …) and the mappers to shared types, `mediaUrl` |
| `filters.ts` | `sceneFilter`, `findFilter`, `withExclusions`, the age buckets, `genderCriterion`, `isBlocked`, `unlistedReasons` |
| `scenes.ts`, `sceneWrites.ts` | scene reads and related videos; ratings, plays, progress, edits, the reserved tags, markers, the destroy |
| `entities.ts` | performers, studios and tags: lists, pages, favourites |
| `activity.ts` | history, stats, affinities, recommendations |
| `facets.ts`, `featured.ts` | the filter panel's counts and the tag tiles; the Featured pool as ranking candidates |
| `jobs.ts` | Identify and following a Stash job |
| `library.ts`, `bulk.ts` | whole-library reads (artwork, StashDB ids, the category lookup, stash-box credentials); bulk category reads and writes for the Cast and studio-defaults syncs |

`dataCache` is not here: it serves Whisparr and StashDB too and lives in `cache/data.ts`.
`exclusions()` is in `blocklist.ts` ([[blocklist-and-exclusions]]).

## Generated types

`stash.schema.graphql` is Stash v0.31.1's own schema (fetched by `scripts/stash-schema.mjs`);
`graphql-codegen` turns it into `src/stash.schema.ts`. Two consequences:

- **Filter inputs are exact types.** A criterion Stash lacks fails `pnpm typecheck` instead of
  returning a 400 at run time. `finders.test.ts` also checks every criterion key each finder
  sends against the introspected filter schemas.
- **Object types describe responses whole**, but each query selects only its fragment's
  fields: anything not selected is `undefined` at run time whatever the type says. Read the
  query before trusting a field.

After a Stash upgrade: [[regenerate-stash-schema]].

## Building blocks worth knowing

| Function | Does |
|---|---|
| `query(gql, vars, tags)` | the one call site: cached by query+variables, tagged for invalidation ([[caching]]); `VOLATILE` (capped) and `PINNED` (never swept) tags keep large working sets out of `data.json` |
| `computed(key, tags, load)` | a small answer built from cached reads (facets, tiles), cached and snapshotted under its own key with `freshInputs`, so its loader never re-stores a stale read as a fresh answer |
| `mutate(q, vars, invalidates, expires)` | writes, then drops the `invalidates` tags and marks the `expires` tags stale |
| `activityTags()` | the extra tags (`activity:play`, `activity:resume`) a list gets when it filters or sorts by activity |
| `featuredCandidates()` | every scene minus exclusions as ranking candidates, one cached query (snapshotted, tag `featured-pool`), mapped once per fetched pool, for [[featured-ranking]] |
| `affinities()` | what you played, rated and O'd, by performer/tag/studio; shared by Featured and For-you |
| `sceneFacets()`, `tagTiles()` | the light fields of every scene in a filter set, tallied by the BFF for the filter panel's live counts ([[browse-and-filters]]); the tiles' best scene per tag. Both are `computed()` answers over a raw set that is PINNED (unfiltered facets, tiles) or VOLATILE (filtered facets) |
| `SCENE_CARD` | the card fragment; its `performers { id name }` carry **no image** since 2026-10-31 (no card renders one, a quarter of a list's raw bytes); `SCENE_DETAIL` adds `image_path` for the scene page's avatars |
| `stashIdsOf()`, `sceneStashIdMap()` | a performer's or studio's StashDB ids; scene StashDB uuid → Stash id, for [[whisparr-shelf]] |
| `tagIdsByName()` | category ids by name without creating any (what a GET may use); `ensureTags()` creates and is for the syncs |

The performer, studio and tag filters have no `id` criterion
([[stash-filters-have-no-id-criterion]]). _Until 2026-11-10 the finders dropped blocked ids
from each page after the query (`dropBlocked`); nothing had passed any since Block stopped
hiding library entries on 2026-11-09, and the path is gone._

## Filter builder rules

Nested `AND` exclusions are fast (~0.2 s, measured 2026-10-26) and `random_<seed>` sort is
stable for paging. Long `OR` chains overflow SQLite's parser, which is why age filters are
bucketed ([[sqlite-or-chain-overflow]]). `stash.test.ts` pins the nesting rules.

## Errors

`StashError` is an `UpstreamError` ([[server-bff]]): the API answers 502 with Stash's message
(`Stash HTTP 4xx` errors carry it since 2026-10-29). Stash calls time out after 60 s; a Stash
that cannot be reached is a `StashError` too (_a bare 500 until 2026-11-10_). "database is
locked" reads are retried with backoff ([[stash-database-locked]]).
