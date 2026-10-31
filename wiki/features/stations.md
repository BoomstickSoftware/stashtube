---
title: Stations
kind: feature
summary: Endless play from a filter set, a scene or a playlist, in Full or Moments mode, with saved stations, per-station resume, an editor and one previews request for the Stations page.
tags: [stations, player, playlists, resume]
status: current
verified: 2026-10-31
updated: 2026-10-31
routes: [/station, /stations, /stations/new, /stations/$id/edit]
api: [GET /api/stations, POST /api/stations, PUT /api/stations/:id, PUT /api/stations/order, DELETE /api/stations/:id, GET /api/stations/previews?day=&q=, GET /api/stations/resume, PUT /api/stations/resume]
code: [apps/web/src/pages/Station.tsx, apps/web/src/pages/Stations.tsx, apps/web/src/pages/StationEditor.tsx, apps/web/src/lib/station.ts, apps/server/src/stations.ts, apps/server/src/previews.ts, apps/server/src/db/schema.ts]
related: [player, seek-bar-markers, moments, browse-and-filters, playlists-and-favorites, home-feed, data-model]
---

# Stations

A station plays videos one after another, full screen, with Skip but no ratings: you steer
with filters. It starts from any list's filters ("Station" in the filter bar, so also
performer, studio and tag pages), from a scene ("Station" by Related: drifts through related
videos), or from a playlist (`/station?playlist=`). Order is shuffled with no repeats until all
have played.

## Modes

- **Full**: whole videos after any intro skip. Plays and resume points are recorded in Stash as
  on the video page, so Continue, History and Most played see them.
- **Moments**: a 30 / 60 / 90 s window around each marker, or at 20 / 40 / 60 / 80 % when a
  video has none, fading out and in between them (`FADE_MS` 700). Records nothing.
- **Unwatched** (`unwatched=1`) plays only never-watched videos, also when drifting.

## Player

The video page's seek bar with sprite frames and marker ticks ([[seek-bar-markers]]; Moments
shade the planned windows and a seek plans a moment from there), ±10 s, previous video, Mark
this moment (hold or `b`, flash only), Favorite, mute, a sleep timer (15 / 30 / 60 min) and a
list panel (side panel, bottom sheet on phones: played, now playing, up next 30; tap any to
jump). Keys: Space/k play-pause, arrows ±5 s, j/l ±10 s, n/p next/previous, b mark, [ ]
markers, q list, m mute, Esc leave. A media error falls back to HLS instead of skipping.
Entering a station stops the [[mini-player]].

## Saved stations and resume

- **Save** (with a name) on a playing station keeps it in the `stations` table: filters or
  starting scene, mode, window. Changing mode or window on a saved station updates it.
- `/stations` lists them as cards (desktop nav, phone header icon) plus quick starts
  (Everything, Unwatched, Favourite performers, Top rated). Each card cycles through screenshots
  of what it plays (4 s, crossfade, staggered, still under reduced motion) and shows its count.
  All cards come from **one request**, `GET /api/stations/previews?day=&q=` (saved stations by
  id, quick starts by their JSON; six Stash queries in flight at once; `previews.ts` has the
  per-station daily seed and the bounded fan-out, tested). It was one request per card before
  2026-10-30.
- **New station** opens the editor (`/stations/new`, `/stations/<id>/edit`): name, mode, moment
  length, and the Filters panel inline over a live grid ([[browse-and-filters]]).
- **Resume**: a saved station or a playlist saves where it is (scene and second) every 15 s
  and on leaving, in `station_resume`, keyed `id:<n>` or `pl:<n>`; the newest 50 are kept. A
  station started from a video, a list or a quick start saves nothing
  ([[stations-only-user-made]]; until 2026-10-31 those were kept as `from:<scene>` and
  `q:<filters>`). A card with a saved spot shows "Resume …"; **Shuffle** starts fresh.
  `/api/stations/resume` carries each station's or playlist's `name`, so Home's "Pick up a
  station" row needs no other list ([[home-feed]]).

Tables: [[data-model]].
