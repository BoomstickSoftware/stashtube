---
title: Seek bar and marker ticks
kind: feature
summary: How the shared seek bar takes touch (tall hit area, relative drag, tap to jump), draws sprite thumbnails and marker ticks, groups nearby markers, and seeks to a marker on a tick tap.
tags: [player, markers, seek-bar, sprites, touch]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/web/src/components/SeekBar.tsx, apps/web/src/components/SpriteThumb.tsx, apps/web/src/lib/playback.ts]
related: [player, stations, moments]
---

# Seek bar and marker ticks

`components/SeekBar.tsx` is shared by the video page's [[player]] and the station player
([[stations]]). It shows a sprite frame while hovering or dragging and draws every marker as a
tick.

## Behaviour

- **Ticks**: `groupMarkers` in `lib/playback.ts` merges markers within 1% of the duration into
  one tick with a count. O-counter marks (title `O`) draw thin and white; named markers draw
  yellow.
- **Hover** a tick to see its sprite frame and `tickLabel` (title · tag).
- **Click or tap** inside a tick's 24 px pad seeks to the marker itself, not to where the
  pointer landed; a drag that starts there still scrubs.
- `[` and `]` jump to the previous and next marker and agree with the ticks.
- In a station's **Moments** mode the bar shades the planned windows, and a seek plans a moment
  from there.
- **Mouse**: the playhead goes where the pointer is and seeks as it moves (desktop
  convention).
- **Touch**: the hit area reaches 28 px above the track (64 px tall in all) while the visible
  track stays thin. A **tap** jumps to where it landed. A **drag** (past 8 px, `DRAG_SLOP`)
  does not jump: the playhead moves by as far as the finger moves, 1:1 with the bar's width,
  from wherever it was, and the whole finger travel counts. It previews (sprite frame and time
  above the playhead, clear of the finger) and seeks once, on release. The bar takes no touches
  while the controls are hidden.
- `SeekBarHandle` (`grab` / `drag` / `drop` / `cancel`) lets a swipe on the picture drive the
  same drag ([[player]]); the station player does not use it yet.

## Where

Sprite frames come from Stash's `vtt` + 160×90 `sprite` through the [[media-proxy]]
(`SpriteThumb.tsx`); markers come with the scene (`Marker.tagId` carries the primary tag).
Markers are edited in the Moments list ([[moments]]).

## Verification

Checked on 2026-10-30 with fake markers patched into the scene response, because the library
had none yet.
