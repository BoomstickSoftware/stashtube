---
title: Search
kind: feature
summary: The typeahead over scenes, performers, studios and tags, what one query returns and where the same search appears inside the Filters dialog.
tags: [search, browse]
status: current
verified: 2026-10-30
updated: 2026-10-30
api: [GET /api/search?q=]
code: [apps/web/src/components/SearchBox.tsx, apps/server/src/api.ts]
related: [browse-and-filters, blocklist-and-exclusions, keyboard-shortcuts]
---

# Search

The header's search box (`/` focuses it, see [[keyboard-shortcuts]]) is a typeahead over the
whole library. One request answers all four kinds.

## Behaviour

`GET /api/search?q=` trims the query to 200 characters and runs four Stash finders in
parallel, 6 results each: scenes, performers (sorted by scene count, limited to the Settings
gender), studios and tags. Blocked ids are removed from every list
([[blocklist-and-exclusions]]). An empty query returns empty lists without touching Stash.

The Filters dialog has its own search over performers, studios, tags and title words, with
counts in the current set ([[browse-and-filters]]); the header search opens the entity or scene
instead.

## Where

`SearchBox.tsx`; the route in `api.ts`. It is one of the first-paint routes the deploy smoke
test hits (`/api/search?q=a`, [[forgejo-ci]]), which is how the tag-filter outage was found
([[stash-filters-have-no-id-criterion]]).
