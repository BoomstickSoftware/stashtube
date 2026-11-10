---
title: "2026-11-10: Polish pass, shared player core, pre-push hook"
kind: history
summary: The UX items the revamp left open (recents, pull to refresh, Play next, "⋯" sheets, skeletons), the shared player core and the pre-push hook.
tags: [history, ux, web, player, stations, search]
status: record
date: 2026-11-10
verified: 2026-11-10
updated: 2026-11-10
related: [2026-11-10-ux-revamp, ui-system, search-recents, player, stations, search, roadmap]
---

# 2026-11-10: Polish pass, shared player core, pre-push hook

The open items left by [[2026-11-10-ux-revamp]] and [[2026-11-10-hardening]], asked for by the
user the same day.

## What changed

- **Search recents** ([[search-recents]]): the empty search box lists the last eight.
- **Pull to refresh** (`PullToRefresh.tsx`), in the installed app only: refetches what the page
  shows; on Home it also draws new picks.
- **Play next** (`lib/upNext.ts`): a card's menu lines a video up after the one playing. The
  video page lists it first under Up next ("Queued"); a docked mini-player moves on to it by
  itself, still docked.
- **Browse** reopens the section last used (`lib/browse.ts`). Its sort was already kept with the
  filters.
- **One `Segmented` control** replaced seven hand-rolled copies.
- **Stations page**: a card is its picture (tap resumes or starts), its name and one "⋯" that
  opens Resume, Start over shuffled, Unwatched only, Rename, Edit, Delete (with Undo). "Start
  from" moved into Quick start. Pinned Home rows got the same "⋯" for Rename, Move, Unpin.
- **Skeletons** for History, Discover, Waiting, the playlists list and Related.
- **Card to player**: the tapped card's picture grows into the player (a named view transition).
- **Shared player core** (roadmap H8, the safe part): `pickSource`, `syncClock`, `useIdle`,
  `transportKey`, `jumpToMarker` in `lib/playback.ts`; `TimeReadout`, `Flash`, `PlayPause` in
  `PlayerParts.tsx`. `Player` and `StationPlayer` stay two components.
- **Pre-push hook**: `.githooks/pre-push` runs `check.mjs`.
- `phone-flow.mjs` took an `init` step (a script that runs before the app).

## How verified

- `check.mjs` green: web tests 10 → 32 (playback, recents, up next).
- `touch-check` on a scene: output identical to the deployed build's, step for step.
- `mini-check` on a production build: every restore path works.
- `phone-flow` (neutral): the station sheet and rename sheet, recents add and remove, Play next
  from a docked player (the queued video started in the dock when the first ended), a simulated
  pull (indicator, Refreshing, cleared).

## Snags

- Chrome's `display-mode` emulation did not turn standalone on; the pull test overrides
  `matchMedia` with the new `init` step.
- A leftover headless Chrome held the neutral profile and the next script could not connect:
  [[check-script-cannot-connect-profile-in-use]].
- The user's iPhone pass the same evening found three faults, fixed at once: the card-to-player
  growth never showed (the name was on the player's host, still hidden and 0 px wide when the
  transition pictured the new page; it is on the slot now, and a trace shows 198 px → 408 px);
  the rename sheet sat behind the keyboard (`useKeyboardInset`); Play next was missing with
  nothing playing (now always offered). Pull to refresh was right.
- Still not seen on the real iPhone after those fixes: the pull, the card-to-player transition, the sheet focus.
