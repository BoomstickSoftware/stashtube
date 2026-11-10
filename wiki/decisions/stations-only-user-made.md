---
title: Only stations you made are remembered
kind: decision
summary: A station started from a video, a list, a performer page or a quick start plays and leaves nothing behind; only saved stations and playlists keep a resume point and appear under "Pick up a station".
tags: [stations, resume, home, ux]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [stations, home-feed, data-model]
---

# Only stations you made are remembered

**Decided** 2026-10-31 by the user. **Status** current.

## Context

Every station kept a resume point, keyed by its filters (`q:`) or its starting video (`from:`)
as well as saved stations (`id:`) and playlists (`pl:`), and Home's "Pick up a station" listed
them all. Pressing "Station" by a video's Related row once was enough to create a "station" there.
The user: "I should be able to define them but creating them because I watched one video makes
no sense."

## Decision

Only stations the user defines remember their place: saved stations and playlists. Ad-hoc ones
still play, but save nothing.

## Consequences

- `remembersPlace()` (web `lib/station.ts`) gates saving; the server ignores other keys and
  drops their old rows (`stations.ts`, `forgetAdHoc`) → [[stations]].
- "Pick up a station" on Home and "Resume" on the Stations page show saved stations and
  playlists only; quick starts no longer offer Resume.
- The ad-hoc entry points ("Station" by Related, in the filter bar, on entity pages) still exist. _Since 2026-11-09 they are the Stations tab's Start from ([[navigation]])._
  Whether to keep them is open ([[roadmap]]).
