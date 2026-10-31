---
title: Browse and filters
kind: feature
summary: The Filters dialog, the stackable per-browser filters, the People filter, live facet counts, sort and multi-select on every list page.
tags: [browse, filters, facets, people, sort]
status: current
verified: 2026-10-31
updated: 2026-10-31
routes: [/browse, /performer/$id, /studio/$id, /tag/$id, /playlist/$id]
api: [GET /api/scenes, GET /api/scenes/facets, GET /api/tags/tiles]
code: [apps/web/src/components/Filters.tsx, apps/web/src/components/SceneBrowser.tsx, apps/web/src/components/AddFilter.tsx, apps/web/src/components/Bulk.tsx, apps/web/src/lib/filters.ts, apps/web/src/lib/describe.ts, apps/server/src/stash.ts]
related: [stations, search, sqlite-or-chain-overflow, filter-popovers-clipped-in-scroll-row, blocklist-and-exclusions, people-pages]
---

# Browse and filters

Every list page (Browse, a performer, studio, tag or playlist) shares `SceneBrowser`: a bar
with a **Filters** button (showing a count), the sort, and the filters in play as removable
chips (excluded tags marked NOT). The bar is sticky from `sm` up only. Lists scroll infinitely;
`random_<seed>` sorts page stably.

## The Filters dialog

One dialog (`components/Filters.tsx`; a full-screen sheet on phones, portalled to `body`): your
stacked filters; one search box for performers, studios, tags (Require / Exclude) and title
words, with popular tags before typing; then Watched, Rating, Quality, Length, followed
performers, age and ethnicity, and Show blocked. It edits a copy and applies on
"Show N videos" (a live count). The station editor shows the same panel inline, applying as you
go ([[stations]]). It replaced a strip of chip popovers that clipped their results
([[filter-popovers-clipped-in-scroll-row]]).

## Live counts

`GET /api/scenes/facets` (`sceneFacets` in `stash.ts`) fetches the light fields of every video
in the set (tags, performers, studio, rating, resolution, length, play state) in one cached
query and tallies them in the BFF. Each choice shows what picking it would give (its own group
left out, the rest applied), dimmed at 0; search results say "12 here · 865 in all". Studios
are any-of, so once one is picked the others keep library counts. Quality is bucketed locally
by short side ≥ 700 / 1000 / 2000 px: close to, not exactly, Stash's resolution enum.
Facets and tag tiles are warmed at boot ([[caching]]).

## Stackable filters

Filters are kept per browser in localStorage (`lib/filters.ts`). A "+" next to performers,
studio and tags on a scene, and "Add to filters" on their pages, adds to them: performers and
tags must all match, studios are any-of. Browse's nav item shows how many are stacked.

## People filter

Age at filming and ethnicity are matched on **one performer of the Settings gender**: Stash's
own `performer_age` would match any performer, so a 40+ male co-star would count. Stash has no
age-at-filming field, so scenes are matched in yearly release-date buckets (right to about six
months), two-year buckets once the library spans more than 16 years
([[sqlite-or-chain-overflow]]). Settings › Performer preferences sets defaults for every list,
the home feed and related videos; a list's own People filter replaces them, Show blocked drops
them.

## Also on the page

Category tiles, multi-select with bulk Favorite, Add to playlist and Delete, and the card menu
(right-click with a mouse; a long press or the card's "⋯" button on touch: Play, Favorite,
Save to playlist…, Mark as watched, Not interested, and with a mouse Delete…; "Station from
here" was dropped and Delete left the phone's sheet on 2026-10-31, decision: a long press
lands on it too easily). On a phone the filter bar is one sideways-scrolling row (Filters,
sort, the count) with the list's actions (Select, Pin to home, Station) behind a "More"
sheet; from `sm` it wraps and shows them inline. Sheets are `components/Sheet.tsx`
([[mobile-first-ui]]).

Selecting (since 2026-10-31): in select mode a click toggles a card, **Shift+click selects
from the last card clicked up to this one**, and **Cmd/Ctrl+A selects everything loaded**
(same as "Select all loaded"). **Shift+right-click** on a card leaves the browser's own menu
(open in new tab, copy link) instead of flix's. The Filters dialog shows the quick choices
(Watched, Rating, Quality, Length) above Find and the tag cloud, so on a phone they are not
below a tall cloud.
`describeQuery` (`lib/describe.ts`) names a filter set for chips, station summaries and
pinned-row titles.

## Numbers

Facets over the whole library (~2,000 scenes) take 0.5–0.9 s cold (2026-10-29).
