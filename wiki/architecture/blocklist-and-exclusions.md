---
title: Blocklist and exclusions
kind: architecture
summary: Blocked tags, performers and studios, plus the "Not interested" tag, are excluded from every list, search, feed and related query unless unblocked=1, and an id a query names explicitly overrides its block.
tags: [blocklist, filters, stash, settings]
status: current
verified: 2026-10-31
updated: 2026-11-09
code: [apps/server/src/blocklist.ts, apps/server/src/stash.ts]
related: [data-model, stash-layer, stash-filters-have-no-id-criterion, people-pages, edu-section]
---

# Blocklist and exclusions

**Rule 4: the blocklist applies to every list, search, feed and related query unless
`unblocked=1`.** An id the query explicitly includes (a performer page, a tag filter) overrides
its block, so a blocked performer's own page still works.

## What is excluded

- Rows of the `blocks` table ([[data-model]]): tag, performer or studio by Stash id, blocked
  from the entity's page or tile (the "block" action) and listed on Settings.
- The Stash tag **Not interested** (created on first use): "Not interested" on a video adds it,
  `exclusions()` treats that tag as blocked, so the video leaves every list; Settings lists
  such videos to undo.

## How

`exclusions()` in `stash.ts` turns both into a scene filter (nested `AND` of `EXCLUDES`
criteria, fast at ~0.2 s). For performer, studio and tag lists the filter types have no `id`
criterion, so `dropBlocked()` removes blocked entities **after** the query
([[stash-filters-have-no-id-criterion]]). Cleanup and Duplicates include blocked and hidden
videos on purpose ([[cleanup-page]], [[duplicates-workbench]]); "Show blocked" in the filter
panel sets `unblocked=1` and drops the People defaults ([[browse-and-filters]]).
`unblocked` is parsed as a flag, so `unblocked=0` keeps the blocklist (_until 2026-10-31_ the
tags list treated any value as on).

Results Stash cannot filter go through `isBlocked()` in `stash.ts` (tags, performers, the
studio and its parent; not the People defaults, which shape what lists offer rather than what
was watched): History, Stats, "Because you watched" on Home, and the station resume points on
Home and Stations. _Until 2026-10-31_ those showed blocked and "Not interested" videos.

## The Edu hold

`exclusions()` also carries the Edu categories (`eduTags`). They are held out only where a view
asks (`holdEdu`, set by `curated()` or `noEdu`): Home, Featured, related videos, stations. Browse
and search show them. A named Edu category lifts the hold for that query ([[edu-section]]).

## Avoid

Any new finder or feed must call `exclusions()` (scenes) or `dropBlocked()` (entities), and a
feed or picker `curated()` too ([[edu-section]]), and be
hit by the smoke list after deploy; the 2026-10-29 outage came from checking only the routes
that were edited.
