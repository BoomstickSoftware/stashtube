---
title: StashDB HTTP 422, then "StashDB calls paused", after a StashDB schema change
kind: gotcha
summary: StashDB's searchPerformers now returns { count performers facets }, so the old query got 422 and five failures paused every StashDB call for 5 minutes.
tags: [stashdb, graphql, resilience, discover]
symptom: "Error: StashDB HTTP 422 on /api/discover/names?kind=performer, then Error: StashDB calls paused until … after repeated failures on /api/discover"
found: 2026-11-09
status: current
verified: 2026-11-09
updated: 2026-11-09
code: [apps/server/src/stashdb.ts]
related: [stashdb-mirror, stashdb, discover]
---

# StashDB HTTP 422, then "StashDB calls paused", after a StashDB schema change

## Symptom

Searching a performer name in Discover's picker answers 500 ("internal error"); the pod log shows
`Error: StashDB HTTP 422` for `/api/discover/names?kind=performer`. After five of those, every
StashDB call, including the plain Discover search `/api/discover?q=…`, fails with
`StashDB calls paused until <time> after repeated failures` for 5 minutes. It looks like one name
breaks search; it is every performer name.

## Cause

StashDB (stash-box) changed `searchPerformers(term, limit)` from returning `[Performer!]!` to
`QueryPerformersResultType { count performers facets }` (it also gained `page`, `per_page`,
`filter`). A selection of performer fields directly on it fails GraphQL validation, which StashDB
answers with HTTP 422 and the reason in the body. `gql()` threw away the body, so the log said only
"HTTP 422". `searchScenes` has the same wrapper shape; `searchStudio` and `searchTag` are still
plain lists (checked 2026-11-09).

## Fix

- `searchEntities` selects `searchPerformers { performers { … } }`.
- `gql()` reads the body on a non-2xx answer and puts the first GraphQL error in the message
  (`StashDB HTTP 422: Cannot query field "id" on type "QueryPerformersResultType".`).

## Avoid

On a 422 from StashDB, introspect the type named in the error before guessing. The probe runs in
the pod, where the keys are: import `stashBox()` from `/app/apps/server/src/stashdb.ts` and POST
`{ __type(name:"Query"){ fields { name type { name kind ofType { name } } } } }` to its endpoint
with `kubectl -n flix exec -i deploy/flix -- node --input-type=module - < probe.mjs`.
