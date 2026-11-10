---
title: Playlists ignore the blocklist
kind: decision
summary: A playlist shows every video put in it, blocked or "Not interested" ones included, and its cover is its first video whatever that is; the blocklist rule stops at lists flix assembles.
tags: [playlists, blocklist, data]
status: superseded
superseded_by: hide-means-delete-block-or-unlist
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-11-09
related: [playlists-and-favorites, blocklist-and-exclusions]
---

# Playlists ignore the blocklist

**Decided** 2026-10-31 by the user. **Status** superseded on 2026-11-09: Block no longer hides
owned videos from any list ([[hide-means-delete-block-or-unlist]]), so playlists are no exception.

## Context

The 2026-10-31 review found playlist covers (and items) taking no notice of the blocklist, while
the rule says the blocklist applies to every list, search, feed and related query
([[blocklist-and-exclusions]]).

## Decision

Playlists need not respect the blocklist: a playlist is something you made by hand, so it shows
what you put in it, and its cover stays its first video.

## Consequences

- Do not add exclusions to `getPlaylist`, `listPlaylists` or playlist stations.
- The blocklist rule covers what flix assembles (lists, search, feeds, related, history, stats,
  station resume), not your own collections ([[playlists-and-favorites]]).
