---
title: StashDB
kind: integration
summary: flix reads a performer's or studio's whole scene catalogue from StashDB with Stash's own stash-box credentials, 24 a page, cached 10 minutes, to label what is not in the library; TPDB is a possible second source later.
tags: [stashdb, catalogue, whisparr, api]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [apps/server/src/stashdb.ts, apps/server/src/stashdb.test.ts, apps/server/src/remote.ts]
related: [whisparr-shelf, whisparr-api, stash-api, media-proxy, config-env]
---

# StashDB

StashDB (`https://stashdb.org/graphql`) is the metadata source Stash identifies against and the
**catalogue** behind flix's "Not in your library yet" shelf ([[whisparr-shelf]]); Whisparr is
the executor that downloads.

## What flix reads

- `queryScenes` filtered by a performer's or studio's StashDB ids (taken from the Stash entity's
  `stash_ids`, `stashIdsOf` in [[stash-layer]]), newest first, **24 a page** ("Show more"
  pages further).
- Each scene's cover is `images[].url` on `stashdb.org` (Whisparr's `images[].remoteUrl` points
  at the same host; 24/24 on the live shelf, 2026-10-31). flix takes the widest and hands the
  browser `/media/remote/<token>` instead, fetched, resized and cached by the server
  ([[media-proxy]]); _hotlinked full size until 2026-10-31_.
- Results are cached 10 minutes (tag `stashdb`); a page is ~8 KB and goes into the snapshot
  (_memory only, `VOLATILE`, until 2026-10-31_) ([[caching]]).
- `stashdb.test.ts` pins the exact queries.

## Credentials

By default flix reads the endpoint and API key from Stash's own configuration
(`configuration.general.stashBoxes`, Settings → Metadata providers in Stash) at first use;
`STASHDB_URL` / `STASHDB_API_KEY` override it ([[config-env]]). `GET /api/features` reports
`stashdb: true` when it resolved. Without StashDB the shelf falls back to Whisparr's own list
(`source: 'whisparr'`).

## Not yet known / later

- TPDB as a second stash-box endpoint (needs the user's TPDB key) is in the backlog; skipped
  unless StashDB coverage gaps appear ([[roadmap]]).
- Whether StashDB's `queryScenes` paging stays stable while new scenes are added between pages
  (inferred fine at 10 min cache).
