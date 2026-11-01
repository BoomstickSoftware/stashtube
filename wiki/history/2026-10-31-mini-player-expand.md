---
title: "2026-10-31: A way back from the mini-player"
kind: history
summary: Three rounds on the iPhone mini-player that would not restore, ending with the real cause fixed (the leaving page cleared the next page's slot, production only).
tags: [player, mini-player, ios, mobile]
status: record
date: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
related: [mini-player, mobile-checks, scripts-library, diagnostics, playwright-webkit-install-hangs, next-video-opens-docked-over-its-own-page]
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

Third round, same evening, after "consistently refusing to load the video on tapping the
spread icon" and "doesn't restore the main player on a page when I close the MiniPlayer":

- The cause was never the taps. Scene to scene (a related card, Back), the new page's slot
  attached and the old page's `leave()` then cleared it, so the new video opened **docked over
  its own empty page**; Expand led to the page already shown and Stop left the gap. Dev's
  StrictMode remount hid it, so every check through Vite dev passed
  ([[next-video-opens-docked-over-its-own-page]]).
- `lib/nowPlaying.ts`: `leave()` and `close()` leave the slot alone; `PlayerSlot`'s ref
  cleanup detaches its own element (`detach(el)`), nothing else clears it ([[mini-player]]).
- `scripts/mini-check.mjs`: three more steps (tap a related card, Back, tap again; each must
  be un-docked on its own page), run against `vite build` + `vite preview --port 5175`
  ([[mobile-checks]]).
- Same commit: the rating stars' fill sat 8 px up and left of its outline on a touch screen
  (the button's padding went to `touch:p-2.5` on 2026-10-31 morning, the fill's inset stayed at
  `0.5`); the fill now uses `touch:inset-2.5`.

## How it was verified

`node scripts/check.mjs` clean all three rounds. Third round: `mini-check` against the
production preview failed all three scene-to-scene steps before the fix (`docked true` on the
new page) and passed every step after it, with the Home round trips unchanged; the same run
against Vite dev passed before and after (StrictMode). A phone-size screenshot of a rated
scene showed the star fills on their outlines. `mini-check` against production through Vite
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
- Two rounds of guessing at the device (z-index, links) before building the app: the headless
  checks ran against Vite dev, whose StrictMode double mount masked the effect-order bug. A
  phone bug no dev check reproduces gets a production build first.
