---
title: Stash's performer, studio and tag filters have no id criterion
kind: gotcha
summary: Sending an `id` criterion to findPerformers, findStudios or findTags makes Stash answer HTTP 4xx, which flix surfaced as 502 on tags, search and tiles for four hours; blocked ids are dropped after the query instead.
tags: [stash, graphql, blocklist, incident]
symptom: "Stash HTTP 4xx on /api/tags, /api/search, /api/tags/tiles (502 from flix)"
found: 2026-10-29
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/server/src/stash.ts, apps/server/src/finders.test.ts]
related: [blocklist-and-exclusions, stash-api, 2026-10-29-round-4-review]
---

# Stash's performer, studio and tag filters have no id criterion

## Symptom

In production on 2026-10-29 the tag browser, search and the tag tiles answered 502 for about
four hours. The BFF log showed Stash rejecting the GraphQL request; before the fix the error
carried no detail (now `Stash HTTP 4xx` errors include Stash's message).

## Cause

`SceneFilterType` accepts `id: { value, modifier: EXCLUDES }`, so [[blocklist-and-exclusions]]
pushed blocked ids into every finder's filter. `PerformerFilterType`, `StudioFilterType` and
`TagFilterType` have no `id` criterion at all. Nothing hit the path until the "Not interested"
tag became the first blocked id to reach `findTags`.

The change had been verified only on the routes that were edited, not on everything that
consumes `exclusions()`.

## Fix

Blocked ids are dropped **after** the query (`dropBlocked` in `stash.ts`). The typed Stash
layer that followed the same day ([[stash-layer]]) makes an unknown criterion a compile error:
filter inputs are generated from Stash's own schema.

## Avoid

- `finders.test.ts` checks every criterion key each finder sends against the introspected
  filter schemas, so a new criterion that Stash lacks fails `pnpm test`.
- After changing anything shared (exclusions, the filter builder, caching), run the deploy's
  smoke list locally or hit every first-paint route in production: `/api/home`,
  `/api/tags/tiles`, `/api/tags`, `/api/search?q=a`, `/api/scenes/facets`, `/api/performers`,
  `/api/studios` (the CI smoke test now does this, see [[forgejo-ci]]).
- To check a filter type by hand: `~/code/nas/scripts/stash.py q '{ __type(name:"TagFilterType"){ inputFields { name } } }'`.
