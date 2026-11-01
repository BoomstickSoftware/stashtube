---
title: The next video opened as a mini-player over its own empty page (production only)
kind: gotcha
summary: Scene to scene the new video showed docked over its own empty page because the leaving page's effect cleanup cleared the slot the new page had just attached; dev's StrictMode remount hid it.
tags: [player, mini-player, react, ios, mobile, testing]
symptom: "Expand does nothing; the video plays in the mini-player on its own scene page; closing it leaves the page's player area empty"
found: 2026-10-31
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [apps/web/src/lib/nowPlaying.ts, apps/web/src/components/NowPlaying.tsx, apps/web/src/pages/Scene.tsx, scripts/mini-check.mjs]
related: [mini-player, scene-page, mobile-checks, diagnostics, 2026-10-31-mini-player-expand]
---

# The next video opened as a mini-player over its own empty page (production only)

## Symptom

On the iPhone (production), tapping a related card on a scene page, or going Back to a scene
already visited, showed the new video docked as the mini-player above the tab bar while the
page's own player area was an empty gap. Expand, the title and the picture "did nothing"
(they link to the page already shown); Stop closed the video and left the gap. From Home the
round trip worked, which is all the headless checks drove, and against Vite dev nothing was
wrong either. The Diagnostics log of a dev run showed the order:
`attach null` (old slot) → `attach el` (new slot) → `leave <old>` → `player: scene <new> docked`.

## Cause

React commits a keyed page swap in this order: the old page's refs detach (mutation), the new
page's refs attach (layout), then the old page's `useEffect` cleanups run (passive), then the
new page's effects. `nowPlaying.leave()` runs in that cleanup and cleared `slot`, taking away
the slot the new page had attached a moment earlier; `open()` then found no slot and docked.
`close()` from `leave()` (a video that never started) did the same. In dev, StrictMode's
mount → unmount → mount of the new page re-attached the slot after the cleanup, so every check
through Vite dev passed.

## Fix

`leave()` and `close()` no longer touch the slot. The slot's own ref owns it: `PlayerSlot`'s
ref callback attaches on mount and returns a cleanup that calls `detach(el)`, which clears the
slot only if that element is still the current one (React 19 ref cleanup). Commit of
2026-10-31 (the third mini-player round, [[2026-10-31-mini-player-expand]]).

## Avoid

- The store never clears the slot on the page's behalf; only the slot's ref does, and only its
  own element.
- `scripts/mini-check.mjs` now taps a related card, goes Back and taps again, each expected
  un-docked on its own page, and **must run against a production build** (`vite build` and
  `vite preview --port 5175` with `FLIX_SERVER`, [[mobile-checks]]): StrictMode hides any
  effect-order bug of this kind. A phone bug that no dev check reproduces: build first.
