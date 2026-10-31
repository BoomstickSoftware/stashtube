---
title: "2026-10-31: A way back from the mini-player"
kind: history
summary: The docked mini-player gained an Expand button and its picture overlay an explicit z-index, after taps on the iPhone did nothing; a new mini-check script drives the round trip with touch events.
tags: [player, mini-player, ios, mobile]
status: record
date: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
related: [mini-player, mobile-checks, scripts-library]
---

# 2026-10-31: A way back from the mini-player

## What changed

- The user reported that on the iPhone nothing restores the docked mini-player to the full
  player: tapping and double-tapping the strip did nothing, leaving only Stop.
- `NowPlaying.tsx`: an **Expand** button in the dock's bar (next to play/pause and Stop, which
  did work) navigates to the scene page; the transparent tap target over the picture got
  `z-10` ([[mini-player]] has the inferred WebKit cause).
- `scripts/mini-check.mjs` (registered, [[scripts-library]]): plays a scene, taps Home with
  touch events, then taps the picture, the title and Expand, each restoring the full player.

## How it was verified

`node scripts/check.mjs` clean. `mini-check` against production through Vite (writes blocked)
on `/scene/2775`: all three restore paths returned to the scene page un-docked with the video
still playing, before and after the change. Headless Chrome never reproduced the iPhone
failure, so the fix is inferred; the user confirms on the phone.

## Snags

- No iOS device is reachable from a session; WebKit-only hit-testing behaviour cannot be
  checked headless. Expand is the guaranteed path whatever the overlay does.
