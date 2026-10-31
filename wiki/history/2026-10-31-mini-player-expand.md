---
title: "2026-10-31: A way back from the mini-player"
kind: history
summary: The docked mini-player gained Expand, a z-index on its picture overlay, then links instead of navigate() and an on-device diagnostics log, after iPhone taps did nothing; Chrome and WebKit scripts drive the round trip.
tags: [player, mini-player, ios, mobile]
status: record
date: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
related: [mini-player, mobile-checks, scripts-library, diagnostics, playwright-webkit-install-hangs]
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

Second round, same day, after the user reported "The expand icon is there but does nothing.
The play/pause and close buttons work as expected":

- The three ways back became `<Link>`s to the scene page instead of buttons calling
  `navigate()`: a real `<a href>` gets there by a full load even if the click handling fails.
- `lib/diag.ts` and Settings → Diagnostics ([[diagnostics]]): an on-device log of errors,
  unhandled rejections, navigations, the player's dock/undock and the dock taps, with Copy.
- `scripts/webkit-mini-check.mjs` (registered): the same round trip in Playwright's real
  WebKit with iPhone emulation, printing console, page errors and failed requests.

## How it was verified

`node scripts/check.mjs` clean both rounds. `mini-check` against production through Vite
(writes blocked) on `/scene/2775`: all three restore paths returned to the scene page
un-docked with the video still playing, before and after each change. `webkit-mini-check`
(video playing, muted) likewise restored by all three paths, before and after the links. So
neither engine reproduces the phone; the next step is the user's Diagnostics copy after a tap
on Expand ([[mini-player]] has the open question).

## Snags

- No iOS device is reachable from a session; a real WebKit is, through Playwright, but it
  did not reproduce the failure either.
- `playwright install webkit` downloaded fine and then hung in its own unzip step, twice;
  unzipping the archive by hand took seconds ([[playwright-webkit-install-hangs]]).
- In WebKit, `video.play()` from `page.evaluate` is refused (`NotSupportedError`) until the
  element is muted; a forced tap on the Player's centre button first seeks to the resume point.
