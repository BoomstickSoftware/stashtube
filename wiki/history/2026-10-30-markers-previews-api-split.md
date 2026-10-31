---
title: "2026-10-30: Seek-bar ticks, one request for station previews, lib/api split"
kind: history
summary: Phases 2i–2k: markers drawn as hoverable, tappable ticks on the seek bar; GET /api/stations/previews answers every station card at once; the web's lib/api.ts split into one module per domain without changing a query key.
tags: [history, player, stations, refactor]
date: 2026-10-30
commits: [f237c74, 947c76b, 333e10d]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [seek-bar-markers, stations, web-app]
---

# 2026-10-30: Seek-bar ticks, one request for station previews, lib/api split

## What changed

- **2i, markers on the seek bar** (f237c74): `SeekBar` draws every marker as a tick (named
  yellow, the player's O marks thin and white); markers within 1% of the duration merge into
  one tick with a count (`groupMarkers` in `lib/playback.ts`). Hovering shows the sprite frame
  with title and tag; a click or a tap on the tick's 24 px pad seeks to the marker itself; a
  drag starting there still scrubs. `[` and `]` agree with the ticks → [[seek-bar-markers]].
- **2j, one request for station previews** (947c76b): `GET /api/stations/previews?day=&q=`
  answers saved stations by id and quick-start queries by their JSON in one call (`previews.ts`
  holds the per-station daily seed and the bounded fan-out, six in flight). The Stations page
  went from one request per card to one; `/stations/resume` names each station or playlist so
  Home's pick-up shelf loads no other list → [[stations]].
- **2k, `lib/api.ts` split by domain** (333e10d): `lib/api/` holds client, scenes, people,
  playlists, stations, home and settings behind an `index.ts` re-export, so every
  `from '../lib/api'` import still works → [[web-app]].

## How it was verified

- Ticks: fake markers patched into the scene response (the library had none yet), checked
  headless with hover and tap.
- Previews: `previews.test.ts`; the Stations page's network tab shows one request.
- The split was a pure refactor: the export list, all 66 query keys and the built chunks
  were unchanged.

## Snags

None recorded.
