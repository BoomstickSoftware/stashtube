---
title: Stash owns activity and metadata; Postgres holds only what Stash cannot
kind: decision
summary: Ratings, plays, resume points, O-counts, markers, performer/studio/tag favourites, titles and tags are written to Stash; flix's database keeps playlists, blocklist, pinned rows, stations and settings.
tags: [architecture, stash, database, data]
status: current
decided: 2026-10-26
by: user
verified: 2026-10-30
updated: 2026-10-30
related: [data-model, stash-api, stash-stays-headless, playlists-and-favorites, moments]
---

# Stash owns activity and metadata; Postgres holds only what Stash cannot

**Decided** 2026-10-26 by the user (confirmed 2026-10-29: stations record plays and resume
points in Stash in Full mode). **Status** current.

## Context

flix could have kept its own ratings and watch history, but the Stash UI remains the admin
console and should stay consistent with what flix shows.

## Decision

Everything Stash has a field for is written to Stash: ratings, play counts and history, resume
points, O-counts, scene markers, performer/studio/tag favourites, titles and tags. Postgres
([[data-model]]) holds only playlists (including the built-in Favorites list, since Stash
scenes have no favourite flag, [[playlists-and-favorites]]), the blocklist, pinned home rows,
saved stations and their resume spots, and settings.

## Consequences

- flix-created markers use the Stash tag "Highlight" and "Not interested" is a Stash tag,
  both created on first use ([[moments]], [[blocklist-and-exclusions]]).
- Backups split the same way: Stash's SQLite on the NAS, flix's data in CNPG
  ([[postgres-cnpg]]).
- Progress saves do not bump a scene's `updated_at` ([[stash-api]]), so the change check does
  not see them.

## Revisit if

Stash drops a field flix relies on, or parts of Stash's backend move behind the BFF
([[stash-stays-headless]]).
