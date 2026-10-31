---
title: Playlists and Favorites
kind: feature
summary: Ordered playlists in Postgres, the built-in Favorites list behind the heart on videos, and the bulk and menu actions that add to them.
tags: [playlists, favorites, postgres]
status: current
verified: 2026-10-31
updated: 2026-10-31
routes: [/playlists, /playlist/$id]
api: [GET /api/playlists, POST /api/playlists, PUT /api/playlists/:id, DELETE /api/playlists/:id, POST /api/playlists/:id/items, DELETE /api/playlists/:id/items/:sceneId, PUT /api/playlists/:id/order, GET /api/favorites, POST /api/favorites, PUT /api/favorites/:sceneId, DELETE /api/favorites/:sceneId, GET /api/scenes/:id/playlists]
code: [apps/server/src/playlists.ts, apps/web/src/pages/Playlists.tsx, apps/web/src/components/PlaylistMenu.tsx, apps/web/src/components/Bulk.tsx, apps/web/src/lib/api/playlists.ts]
related: [data-model, stations, stash-owns-activity, private-session, playlist-shuffle-plays-shuffled]
---

# Playlists and Favorites

Playlists are one of the few things Postgres holds, because Stash cannot: ordered lists of
scene ids (`playlists`, `playlist_items`; see [[data-model]]).

## Behaviour

- A playlist is ordered; drag to reorder, Play all, and play it as a station
  (`/station?playlist=`, [[stations]]). **Shuffle** plays it as a station in a random order
  (`/station?playlist=<id>&shuffle=1`, reshuffled each time round) and never changes the stored
  order ([[playlist-shuffle-plays-shuffled]]); _until 2026-10-31_ it rewrote the order with
  `PUT /order` before playing.
- Deleting a playlist also deletes its `pl:<id>` station resume row ([[stations]]).
- **Favorites** is a built-in playlist (`kind = 'favorites'`, unique) behind the heart on every
  video, because Stash scenes have no favourite flag. Performer and studio hearts are different:
  those are Stash favourites ([[people-pages]]).
- Add from the scene page, the card menu, or multi-select with bulk Favorite and Add to
  playlist (`Bulk.tsx`). The `PlaylistMenu` survives the phone keyboard opening.
- Deleting a video drops it from every playlist ([[delete-via-whisparr]]). A video deleted
  outside flix (Stash's UI, Whisparr, a move on the NAS) is swept out of playlists and station
  resume points two minutes after startup and after every change Stash reports (`sweep.ts`).
  The sweep asks Stash fresh which referenced scenes exist, and removes nothing when more than
  half (and more than 3) look gone, since that means Stash is in a bad state, not that you deleted
  them. Stations started from a deleted video are left alone.
- Playlists ignore the blocklist: they show whatever you put in them ([[playlists-ignore-blocklist]]).
- While a playlist loads, the page is its own frame: the cover card's skeleton
  (`HeaderSkeleton shape="playlist"` in `EntityHeader.tsx`) on the left and six row bones on
  the right, so nothing moves when the list arrives (since 2026-10-31; _a bare spinner for
  over 3 s on a phone before_, phone audit item 11).
- Favourites and playlist edits are curation, so a [[private-session]] does not block them.

The lists are persisted in the browser (`flix.queries`) for a cold open ([[caching]]).
