---
title: Playlist Shuffle plays shuffled, never rewrites the order
kind: decision
summary: Shuffle on a playlist page plays the playlist as a station in a random order (/station?playlist=<id>&shuffle=1); the stored order, the one thing the user curates by position, is never written by a play action.
tags: [playlists, stations, ux]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [playlists-and-favorites, stations, playlists-ignore-blocklist]
---

# Playlist Shuffle plays shuffled, never rewrites the order

**Decided** 2026-10-31 by the user (UX audit decision D4). **Status** current.

## Context

Until 2026-10-31 the Shuffle button on a playlist page shuffled the ids client-side, saved
that order with `PUT /api/playlists/:id/order` and then played the first video
(`Playlists.tsx`). A hand-ordered playlist, the one collection the user curates by position
([[playlists-ignore-blocklist]]), was destroyed by a button that reads like "play shuffled"
(IA finding F5 in `docs/audits/2026-10-31-ux/ia.md`). The choice was between keeping the
write under an honest name ("Reorder randomly", with a confirm) and making Shuffle a play
action only.

## Decision

Shuffle plays the playlist shuffled and never changes the stored order. It starts the
playlist station with `shuffle=1` (`/station?playlist=<id>&shuffle=1`); `StationQueue`
shuffles the playlist's items each time round.

## Consequences

- No play action writes `playlist_items`. Reordering stays explicit: drag, or the up/down
  arrows on each row.
- The station route and `StationSearch` carry a `shuffle` flag; a shuffled playlist station
  resumes under the same `pl:<id>` key as the ordered one ([[stations]]).
- A "Reorder randomly" write is deliberately **not** offered; if one is ever wanted it is a
  separate button with a confirm, not Shuffle.

## Revisit if

The user asks for a saved random order (for example to share or export a playlist in the
order it last played).
