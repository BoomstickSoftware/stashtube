---
title: Stash layer (stash.ts and the generated schema)
kind: architecture
summary: stash.ts is the only module that knows Stash's GraphQL schema; its types are generated from Stash v0.31.1's own schema, so an unknown filter criterion is a compile error, and blocked ids are dropped after the query.
tags: [stash, graphql, codegen, server]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/server/src/stash.ts, apps/server/src/stash.schema.ts, apps/server/stash.schema.graphql, apps/server/codegen.ts, apps/server/src/finders.test.ts]
related: [stash-api, regenerate-stash-schema, stash-filters-have-no-id-criterion, blocklist-and-exclusions, caching]
---

# Stash layer (`stash.ts` and the generated schema)

`apps/server/src/stash.ts` holds every Stash GraphQL call and the Stash→flix mapping onto the
[[shared-contract]] types. Nothing else in the server knows Stash's schema; the web never does.

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
| `query(gql, vars, tags)` | the one call site: cached by query+variables, tagged for invalidation ([[caching]]); `VOLATILE` tags keep large working sets out of `data.json` |
| `mutate()` | writes, then drops the cache tags they affect |
| `activityTags()` | the extra tags (`activity:play`, `activity:resume`) a list gets when it filters or sorts by activity |
| `exclusions()` | the blocklist plus the "Not interested" tag as a scene filter ([[blocklist-and-exclusions]]) |
| `dropBlocked()` | removes blocked performers/studios/tags **after** the query, because those filter types have no `id` criterion ([[stash-filters-have-no-id-criterion]]) |
| `featuredPool()` | every scene minus exclusions, one cached VOLATILE query, for [[featured-ranking]] |
| `affinities()` | what you played, rated and O'd, by performer/tag/studio; shared by Featured and For-you |
| `sceneFacets()` | the light fields of every scene in a filter set, tallied by the BFF for the filter panel's live counts ([[browse-and-filters]]) |
| `stashIdsOf()`, `sceneStashIdMap()` | a performer's or studio's StashDB ids; scene StashDB uuid → Stash id, for [[whisparr-shelf]] |

## Filter builder rules

Nested `AND` exclusions are fast (~0.2 s, measured 2026-10-26) and `random_<seed>` sort is
stable for paging. Long `OR` chains overflow SQLite's parser, which is why age filters are
bucketed ([[sqlite-or-chain-overflow]]). `stash.test.ts` pins the nesting rules.

## Errors

`Stash HTTP 4xx` errors carry Stash's message (since 2026-10-29). Stash calls time out after
60 s. "database is locked" reads are retried with backoff ([[stash-database-locked]]).
