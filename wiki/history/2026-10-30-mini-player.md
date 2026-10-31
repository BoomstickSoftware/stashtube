---
title: "2026-10-30: Mini-player"
kind: history
summary: Phase 2p: the video keeps playing while you browse; one Player element is laid over the scene page's slot or docked as a strip/card, so the same <video> node survives navigation and nothing reloads.
tags: [history, player, ux]
date: 2026-10-30
commits: [089ad45]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [mini-player, player, prod-checks-read-only]
---

# 2026-10-30: Mini-player

## What changed

- The scene page no longer renders the `Player`: it opens its scene in `lib/nowPlaying.ts` (a
  small external store) and renders a `PlayerSlot`. `NowPlayingHost`, mounted once in
  `Layout`, renders the one `Player` over that slot (absolute within the layout, re-measured
  by ResizeObserver, so it scrolls with the page) or, on any other page, docks it: a strip
  above the phone tab bar, a card bottom-right on desktop, with title, time, play/pause, stop
  and a tap back to the page.
- One element skeleton for both placements keeps the same `<video>` node, so nothing reloads;
  coming back to the scene finds it still playing. Keys unbind while docked; entering
  `/station` stops it; Settings → Playback "Keep playing while browsing" (`flix.keepPlaying`,
  per browser) turns it off. Watch accounting continues while docked unless the session is
  private → [[mini-player]], [[player]].
- `FLIX_SERVER=http://flix.lan` lets Vite proxy to production for UI checks when no dev BFF
  runs, for the check scripts only ([[prod-checks-read-only]]).

## How it was verified

Headless: a marker set on the `<video>` node survived navigating to Home and back, and the
current time stayed monotonic, proving one node and no reload.

## Snags

None recorded.
