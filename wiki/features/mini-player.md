---
title: Mini-player
kind: feature
summary: How the one Player element follows you from the scene page to a docked strip or card without reloading the video, and what stops it.
tags: [player, mini-player, layout]
status: current
verified: 2026-11-10
updated: 2026-11-10
code: [apps/web/src/lib/nowPlaying.ts, apps/web/src/components/NowPlaying.tsx, apps/web/src/components/Layout.tsx, apps/web/src/pages/Scene.tsx]
related: [player, scene-page, stations, private-session, mobile-checks, diagnostics, next-video-opens-docked-over-its-own-page]
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
- On any other page it docks the player: a strip above the phone tab bar (up to `lg`, with
  the tab bar), or a card bottom-right from `lg` (`mini` prop: picture and progress line
  only, keys unbound), with
  title, time, Expand, play/pause and Stop.
- **Back to the full player**: the Expand button, the title, or a tap on the picture. All
  three are router `<Link>`s to the scene page (since 2026-10-31 evening; _until then_ buttons
  calling `navigate()`), whose slot the host then lays the same element over. A real
  `<a href>` still gets there, by a full load, if the script's click handling fails. Each tap
  is logged for Settings → [[diagnostics]] (`dock: tap Expand|title|picture`), with the
  player's dock/undock transitions and every navigation.
- **The slot belongs to its ref.** `PlayerSlot`'s ref attaches the element on mount and its
  cleanup detaches that element only; `leave()` and `close()` never clear the slot. Scene to
  scene (a related card, Back to a cached page) React attaches the new page's slot before it
  runs the old page's effect cleanup, so a `leave()` that cleared the slot docked the new video
  over its own empty page. That was "the iPhone problem" of 2026-10-31 (Expand, the title and
  the picture "did nothing" because they led to the page already shown, and Stop left the gap):
  production only, since dev's StrictMode remount re-attached the slot, which is why neither
  headless engine reproduced it through Vite dev
  ([[next-video-opens-docked-over-its-own-page]]). `scripts/mini-check.mjs` now covers the
  scene-to-scene paths and runs against a production build ([[mobile-checks]]). The picture
  overlay's `z-10` and the links instead of `navigate()` from the earlier rounds are kept.
- Both placements share one element skeleton, so coming back to the scene finds it still
  playing. Verified 2026-10-30: a marker set on the node survived Home and back, and the time
  stayed monotonic.

## Play next

A card's menu always offers **Play next** (`lib/upNext.ts`, sessionStorage, up to 20); with
nothing playing the video waits for the next one started (_only while something played until
the iPhone pass of 2026-11-10, where the item was simply missing_). On the video's page the queued videos lead the Up next list, marked "Queued". Docked,
the player moves on to the first queued video when the current one ends, and stays docked.
Opening a video takes it off the queue.

## What stops it

Leaving a page whose video never started; Settings → Playback "Keep playing while browsing"
off (`flix.keepPlaying`, per browser); entering `/station` ([[stations]]); Stop on the card.
Watch accounting continues while docked unless the session is private ([[private-session]]).
