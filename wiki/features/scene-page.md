---
title: Scene page
kind: feature
summary: What the video page shows and lets you change, from inline title and tag edits to Identify, rating, O, Favorite, Delete and the Moments list.
tags: [scene, player, editing, stashdb]
status: current
verified: 2026-10-31
updated: 2026-11-09
routes: [/scene/$id]
api: [GET /api/scenes/:id, PATCH /api/scenes/:id, PUT /api/scenes/:id/rating, POST /api/scenes/:id/o, POST /api/scenes/:id/identify, GET /api/jobs/:id, PUT /api/scenes/:id/hidden, GET /api/scenes/:id/related]
code: [apps/web/src/pages/Scene.tsx, apps/web/src/components/SceneEditor.tsx, apps/web/src/components/Moments.tsx, apps/web/src/components/EntityHeader.tsx]
related: [player, mini-player, moments, related-videos, delete-via-whisparr, browse-and-filters, stash-owns-activity]
---

# Scene page

A touch or hover on a link fetches the scene (the route's loader, on intent); while it loads,
the page shows the card a list already had (screenshot, title, performers) in the player's
frame, not a blank spinner.

`/scene/<id>` is a `PlayerSlot` (the one `Player` is laid over it by `NowPlayingHost`, see
[[mini-player]]) above the scene's metadata, actions, Moments and related videos. Everything it
edits is written to Stash, which owns ratings, plays, O-counts, markers, titles and tags
([[stash-owns-activity]]).

## Behaviour

- **Title and categories** (tags; "Edit categories" in the UI, [[categories-and-us-spelling]])
  edit in place (`SceneEditor`): `PATCH /api/scenes/:id`.
- **Identify on StashDB** for this one scene: `POST /api/scenes/:id/identify` queues a Stash
  job and **waits for it** (up to 40 s, well under the client's 65 s), answering 200 with the
  finished job, or 202 with the running one, which `GET /api/jobs/:id` then follows from the
  page; the server keeps following it too, so its caches are dropped even if you leave the page
  (since 2026-10-31, audit F6; _before, leaving the page lost the result for a minute or two_).
  The button says "Identified (no change means no StashDB match)" or "Identify failed: …"
  ([[stashdb]], [[caching]]).
- **Rating** (stars, half steps), **O** counter, **Favorite** heart (the built-in Favorites
  playlist, [[playlists-and-favorites]]), **Not interested** (hides it everywhere,
  [[blocklist-and-exclusions]]; pressed it reads "Not interested ✓" and the toast says "Marked
  not interested · Undo", here and in the card menu; _"Hidden" / "Hidden from flix" until
  2026-10-31_). **Delete** sits in the details card beside Identify since 2026-10-31 (_it was
  in the action row next to Favorite_; destructive, so away from the everyday actions,
  [[delete-via-whisparr]]).
  **Mark as watched** is not on this page: it lives in the card's long-press / right-click
  menu (`CardMenu.tsx`); **Remove from Continue** sits beside Identify when the video has a
  resume point ([[continue-history-stats]], since 2026-11-09); _the page listed it until 2026-10-31_ (UX audit, F14 in
  `docs/audits/2026-10-31-ux/ia.md`).
- **Playlist** opens the save-to-playlist menu (_the button said "Save" until 2026-10-31_).
- **Station** by Related starts a drifting station from this scene ([[stations]]).
- **+** next to each performer, the studio and each tag adds it to the stacked filters
  ([[browse-and-filters]]). On a touch screen (`pointer: coarse`) the studio's and the
  performers' badges are labelled **Filter** chips (44 px; "In filters" once added), since a
  bare "+" read as "follow" and its title never shows on iOS (since 2026-10-31; the tag chips
  keep the "+").
- The full description shows; file path, format, size and links fold under the categories
  behind "Show file and links".
- **Moments** lists every marker below the video ([[moments]]).
- **Related videos**: beside the video from `lg` (1024 px), the first 8 as compact rows in the
  400 px sidebar, the other 16 as a **More like this** card grid under both columns; below `lg`
  all 24 are rows under the details. A playlist's **Up next** is never capped: its order is the
  point ([[related-videos]]; since 2026-10-31, _before, all 24 rows ran down the sidebar, two
  screens past the details_).
- Play buttons from elsewhere pass `?play=1` so the video starts at once; otherwise it opens
  paused unless Settings › Playback says otherwise ([[player]]).

The rating, O, marker and Mark-as-watched writes go through `guardWrite()`, so a private
session turns them into a toast ([[private-session]]).
