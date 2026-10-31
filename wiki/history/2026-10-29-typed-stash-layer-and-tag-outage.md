---
title: "2026-10-29: The typed Stash layer, after a four-hour tag outage"
kind: history
summary: The "Not interested" tag sent an id criterion to Stash's tag filter, which has none, so tags, search and tiles answered 502 for four hours; blocked ids now drop after the query and Stash's schema types are generated.
tags: [history, incident, stash, graphql, types]
date: 2026-10-29
commits: [428f86b, f19bfa9]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [stash-filters-have-no-id-criterion, stash-layer, regenerate-stash-schema]
---

# 2026-10-29: The typed Stash layer, after a four-hour tag outage

## What changed

- **Incident**: after Round 4's "Not interested" feature shipped, the tag it creates became
  the first blocked id to reach `findTags`. Stash's performer, studio and tag filters have no
  `id` criterion, so Stash answered 4xx and flix 502 on the tag browser, search and the tag
  tiles for about four hours. The change had been verified only on the routes that were
  edited, not on every consumer of `exclusions()` ([[stash-filters-have-no-id-criterion]]).
- **Fix** (428f86b): blocked ids are dropped after the query (`dropBlocked`); `Stash HTTP 4xx`
  errors carry Stash's message; `finders.test.ts` checks every criterion key each finder
  sends against the introspected filter schemas → [[blocklist-and-exclusions]].
- **Typed Stash layer** (f19bfa9): `apps/server/stash.schema.graphql` is Stash v0.31.1's own
  schema and `src/stash.schema.ts` is generated from it with graphql-codegen. Filter inputs
  are exact types, so a criterion Stash lacks is a compile error, not a 400; `Raw = any` is
  gone from `stash.ts`. Object types describe responses whole, but each query selects only
  its fragment's fields: anything else is `undefined` at runtime whatever the type says
  → [[stash-layer]], [[regenerate-stash-schema]].
- The deploy workflow gained its rollout wait and smoke test the same day (c5f355c,
  [[forgejo-ci]]), so a broken first-paint route is noticed in minutes.

## How it was verified

Every first-paint route curled in production after the fix; `pnpm test` with the new
`finders.test.ts`; typecheck across the generated types.

## Snags

- Verification scope: a shared helper changed means every route that uses it must be
  checked, not only the ones edited. The smoke test now does this on every deploy.
