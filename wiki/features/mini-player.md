---
title: Mini-player
kind: feature
summary: How the one Player element follows you from the scene page to a docked strip or card without reloading the video, and what stops it.
tags: [player, mini-player, layout]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [apps/web/src/lib/nowPlaying.ts, apps/web/src/components/NowPlaying.tsx, apps/web/src/components/Layout.tsx, apps/web/src/pages/Scene.tsx]
related: [player, scene-page, stations, private-session, mobile-checks]
---

# Mini-player

The video keeps playing while you browse. There is exactly one `Player` in the app, and the
same `<video>` node is used wherever it shows, so nothing reloads.

## How it works

- The [[scene-page]] does not render the `Player`. It opens its scene in `lib/nowPlaying.ts`
  (a small external store) and renders a `PlayerSlot`.
- `NowPlayingHost`, mounted once in `Layout`, renders the one `Player` and lays it over that
  slot: absolute within the layout, re-measured by a ResizeObserver, so it scrolls with the
  page.
- On any other page it docks the player: a strip above the phone tab bar, or a card
  bottom-right on desktop (`mini` prop: picture and progress line only, keys unbound), with
  title, time, Expand, play/pause and Stop.
- **Back to the full player**: the Expand button, the title, or a tap on the picture, all
  navigate to the scene page, whose slot the host then lays the same element over. Expand was
  added 2026-10-31 after the user found no way back on the iPhone: taps on the picture did
  nothing there while they worked in headless Chrome. Inferred cause: WebKit composites a
  playing inline `<video>` on its own layer and hit-tests it over a transparent sibling
  without a z-index; the overlay button now has `z-10`. `scripts/mini-check.mjs` drives the
  three restore paths with touch events ([[mobile-checks]]). _Not yet confirmed on the phone._
- Both placements share one element skeleton, so coming back to the scene finds it still
  playing. Verified 2026-10-30: a marker set on the node survived Home and back, and the time
  stayed monotonic.

## What stops it

Leaving a page whose video never started; Settings → Playback "Keep playing while browsing"
off (`flix.keepPlaying`, per browser); entering `/station` ([[stations]]); Stop on the card.
Watch accounting continues while docked unless the session is private ([[private-session]]).
