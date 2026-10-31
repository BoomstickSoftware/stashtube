---
title: Inspect and clear the caches
kind: runbook
summary: Where to see hit rates and the requests actually sent to Stash, how to clear the query or asset cache, how to warm artwork by hand, and when each is the right move.
tags: [caching, admin, operations]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/server/src/admin.ts, apps/web/src/components/CachePanel.tsx, apps/server/src/warm.ts]
related: [caching, config-env, stash-database-locked]
---

# Inspect and clear the caches

Background: [[caching]]. The admin surface is Settings → Cache in the app, backed by:

```sh
curl -s http://flix.lan/api/admin/cache | jq .          # hit rates, sizes, requests sent to Stash
curl -s -X POST http://flix.lan/api/admin/cache/clear -H 'content-type: application/json' \
     -d '{"scope":"data"}'                              # data | assets | all
```

(Add the session cookie if `FLIX_PASSWORD` is ever set.)

## When to do what

| Situation | Do |
|---|---|
| A page shows stale metadata after an edit **in Stash's UI** | wait up to 60 s (the change check runs while flix is in use); if still stale, clear `data` |
| A Stash scan or Identify just finished and new scenes are missing | same; the change check catches count and `updated_at` changes |
| An image is wrong or a sprite missing | clear `assets` (cheap: refilled on demand and by the warm) |
| Testing a cold start | clear `all`; the home feed, facets and tiles re-warm in the background |
| Artwork should be pre-fetched now | Settings → Cache → warm (otherwise daily at `WARM_AT_UTC`, 06:00 UTC) |

Clearing `data` costs Stash a burst of queries; do not do it while a scan holds its database
([[stash-database-locked]]). Stale reads are served while refreshing, so a clear never makes
the UI empty, only slower for a moment.

## Reading the panel

"Requests sent to Stash" is the number that should stay near zero while browsing warm pages;
if it climbs during normal use, a query is missing its cache tags or a key varies per request.
