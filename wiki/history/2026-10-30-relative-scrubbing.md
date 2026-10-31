---
title: "2026-10-30: Relative scrubbing and picture swipe"
kind: history
summary: The seek bar's touch area grew far above its thin track, a touch drag moves the playhead relative to the finger (1:1) while a tap still jumps, and a sideways swipe on the picture scrubs the same way.
tags: [history, player, touch, seek-bar]
date: 2026-10-30
commits: [c45e31f]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [seek-bar-markers, player, mobile-first-ui, mobile-checks]
---

# 2026-10-30: Relative scrubbing and picture swipe

Asked for from use on the iPhone in sideways full screen: navigating a scene took aim, and a
drag snapped the playhead to the finger.

## What changed

- **Seek bar on touch**: an invisible hit area reaches 28 px above the track; the drawn track is
  unchanged. A tap jumps; a drag moves the playhead by the finger's travel, 1:1 with the bar's
  width, from where it was, previewing and seeking on release. Mouse behaviour is unchanged.
  The preview now sits above the playhead (CSS `clamp`), clear of the finger → [[seek-bar-markers]].
- **Picture swipe**: a sideways swipe anywhere on the picture drives the same drag through
  `SeekBarHandle`; vertical swipes still go to the page → [[player]].
- The user chose 1:1 speed for now, with fine scrubbing (slower as the finger moves up) left
  for later.

## How it was verified

`touch-check.mjs` (rewritten for the new gestures, each step prints the expected time) against
a Vite proxying production, at 932×430 and 440×956: every landing matched its expected time
exactly (drag +20%, tap at 30%, drag from 40 px above the track, swipe +30% of the picture).
A CDP mouse run at 1280×800 confirmed desktop still seeks absolutely and the hover preview
clamps at the edge. Typecheck, web `tsc -b`, lint (no new warnings), 69 tests, image build.

## Snags

- `touch-check.mjs` still looked for `main video[poster]`, which has been wrong since the
  [[mini-player]] moved the `<video>` out of `<main>`; it now looks for `video[poster]`.
- `pnpm typecheck` does not typecheck the web app (no script there); a TS error got past it and
  was caught by `tsc -b` → [[run-checks]].
- Rebasing the drag at the slop point lost about 20 px of every drag (headless Chrome holds
  touch moves inside ~15 px); the drag now counts the whole finger travel.
