---
title: Search
kind: feature
summary: The typeahead over scenes, performers, studios and tags, what one query returns and where the same search appears inside the Filters dialog.
tags: [search, browse]
status: current
verified: 2026-10-30
updated: 2026-11-09
api: [GET /api/search?q=]
code: [apps/web/src/components/SearchBox.tsx, apps/server/src/api.ts]
related: [browse-and-filters, blocklist-and-exclusions, keyboard-shortcuts]
---

# Search

The header's search box (`/` focuses it, see [[keyboard-shortcuts]]) is a typeahead over the
whole library. One request answers all four kinds.

## Behaviour

`GET /api/search?q=` trims the query to 200 characters and runs four Stash finders in
parallel, 6 results each: scenes, and performers, studios and tags taken from the 30 with the
most videos and ranked by how well the name matches (exact, then starts with, then a word starts
with; `rank.ts`), so an exact name with few videos is not crowded out (_the 6 with the most
videos until 2026-11-09_). `GET /api/tags?q=` (the Filters dialog's categories, of which it shows
10) is ranked the same way. Blocked ids are removed from every list
([[blocklist-and-exclusions]]). An empty query returns empty lists without touching Stash.

The Filters dialog has its own search over performers, studios, tags and title words, with
counts in the current set ([[browse-and-filters]]); the header search opens the entity or scene
instead.

## Where

`SearchBox.tsx`; the route in `api.ts`. It is one of the first-paint routes the deploy smoke
test hits (`/api/search?q=a`, [[forgejo-ci]]), which is how the tag-filter outage was found
([[stash-filters-have-no-id-criterion]]).
