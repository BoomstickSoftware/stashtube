---
title: "2026-10-27: Mobile and speed round"
kind: history
summary: Phase 2d, from use on an iPhone 17 Pro Max: targeted cache invalidation, a cache that survives restarts, nightly artwork pre-fetch, and the touch player (tap, double tap, native fullscreen, sideways full screen).
tags: [history, mobile, caching, player]
date: 2026-10-27
commits: [4f1ac5f, 9ecdc39, 185e700, 2fe4b25, 8483d37, 1136964, b77d19a]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [player, caching, mobile-first-ui, 2026-10-28-round-2]
---

# 2026-10-27: Mobile and speed round

## What changed

**Speed** ([[caching]]):
- Plays and progress saves drop only `scene:<id>` and the activity-sorted queries; until
  this round they emptied every `scene` query, so watching anything left Home and Browse cold.
- The query cache is saved to disk and restored at boot; the home feed is warmed at boot and
  after Stash changes. Measured: cold `/api/home` 0.7–1.9 s, warm 4–8 ms, 10 ms from the
  restored cache after a restart.
- The browser keeps the home feed, settings and playlists for an instant cold open.
- Request timeouts on both sides; all artwork pre-fetched nightly (06:00 UTC) and from a
  Settings button ([[cache-admin]]).

**Player on touch** ([[player]], [[mobile-first-ui]]):
- Tap toggles the controls; double tap seeks; centre −10 / play / +10 buttons.
- The seek bar seeks on release and takes no taps while hidden; no sideways panning.
- iPhone fullscreen through the native video; Android locks to landscape; a phone turned
  sideways fills the screen and a swipe up hides Safari's bar.
- Speed and Mark moved into the settings menu.
- "Resumed at … · Start over" pill; videos open paused unless Settings › Playback says
  otherwise (`?play=1` always starts).

**Page**: no iOS zoom on inputs; safe-area padding; the page cannot pan sideways; hover-only
controls visible on touch; the playlist menu survives the keyboard opening. Scene card
previews start on a slight drag on touch (b77d19a). Ratings patch only paged lists in the
cache (1136964).

## How it was verified

On the phone, and with the first headless check scripts ([[mobile-checks]]).

## Snags

- Scroll-locking the sideways player kept Safari's bar on screen
  ([[safari-address-bar-needs-page-scroll]]).
- "No QueryClient set" after a dependency bump ([[vite-duplicate-react-query]]).
- A headless run without write blocking recorded plays in Stash
  ([[check-scripts-wrote-plays-to-stash]]).
