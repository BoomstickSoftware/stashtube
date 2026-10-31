---
title: Moments (markers)
kind: feature
summary: Marking a moment with a hold, b or the gear menu, the Undo/O banner, and the Moments list under the video where markers are retitled, retagged and deleted.
tags: [markers, moments, player, touch, stash]
status: current
verified: 2026-10-30
updated: 2026-10-30
api: [POST /api/scenes/:id/markers, PUT /api/scenes/:id/markers/:marker, DELETE /api/scenes/:id/markers/:marker]
code: [apps/web/src/components/Moments.tsx, apps/web/src/components/Player.tsx, apps/web/src/lib/hooks.ts, apps/web/src/lib/playback.ts, apps/server/src/api.ts, apps/server/src/markers.test.ts]
related: [long-press-to-mark, seek-bar-markers, player, stations, private-session, stash-owns-activity]
---

# Moments (markers)

A moment is a Stash scene marker. flix creates, edits and deletes them in Stash
([[stash-owns-activity]]); Stash requires a primary tag on every marker, so flix's default is
the tag **Highlight**, created on first use.

## Marking

- On a touch screen, **holding the picture for half a second** (`useLongPress` in
  `lib/hooks.ts`) marks the current time without pausing or showing the controls, with a pulse
  where the finger was. Why a hold: [[long-press-to-mark]].
- `b`, and "Mark this moment" in the gear menu, do the same elsewhere.
- Every mark shows a **banner for 5 s**: "Marked m:ss · O · Undo". Undo deletes the marker (or
  cancels it if Stash has not answered yet). **O** counts an O-counter press and retitles the
  marker `O`. The scene page's own O button does the reverse: it counts the O and, once the video
  has played more than 3 s, also creates an `O` marker at the current time (`pages/Scene.tsx`).
  `POST /api/scenes/:id/markers` returns the marker to make this possible.
- The first three videos on a touch device show "Hold the picture to mark a moment" while the
  controls are up (`flix.hint.hold`).
- The station player has the same hold (flash only, no banner).
- A [[private-session]] blocks all of it with its toast (`guardWrite()`).

## The Moments list

`components/Moments.tsx`, below the video on the [[scene-page]]: every marker with its sprite
frame, time, title and primary tag. Title edits in place (blur or Enter); the tag is picked
from a search over Stash's tags; `PUT …/markers/:marker` takes `title` and/or `tagId`. Delete
shows an Undo toast that recreates it (`POST` takes an optional `tagId`). O markers show a
droplet; an untitled marker displays its tag's name. Full-width rows on phones, two columns on
desktop. The seek-bar ticks ([[seek-bar-markers]]) and a station's Moments mode follow edits at
once.

## Checks

`markers.test.ts` covers the marker mapping. `scripts/mobile-check.mjs` blocks and logs marker,
O and rating writes, so gesture tests prove the attempt without touching Stash
([[prod-checks-read-only]]).
