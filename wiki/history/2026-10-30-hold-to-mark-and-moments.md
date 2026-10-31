---
title: "2026-10-30: Hold to mark, and the Moments list"
kind: history
summary: Phases 2r and 2s: a half-second hold on the picture marks the moment without pausing, with Undo and an O upgrade; the marker chips became an editable Moments list (title, tag, delete with Undo).
tags: [history, markers, moments, mobile]
date: 2026-10-30
commits: [db89cea, 482aefa]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [moments, long-press-to-mark, seek-bar-markers]
---

# 2026-10-30: Hold to mark, and the Moments list

## What changed

- The user chose a long press on the picture over a bar button or a floating button
  ([[long-press-to-mark]]): marking on a phone had taken pause → gear → Mark → close → resume.
- **2r** (db89cea): a half-second hold (`useLongPress` in `lib/hooks.ts`) marks the current
  time in both players without pausing or showing the controls, with a pulse where the finger
  was and a 5 s banner "Marked m:ss · O · Undo". Undo deletes the marker (or cancels it if
  Stash has not answered); O counts an O-counter press and retitles the marker `O`, reachable
  in fullscreen for the first time. `b` and the gear menu's item show the same banner; a tap
  closes the gear menu. A hint teaches the hold on the first three videos
  (`flix.hint.hold`). `POST /scenes/:id/markers` returns the marker for this.
- **2s** (482aefa): **Moments** (`components/Moments.tsx`) under the video lists every marker
  with its sprite frame, time, title and primary tag, each editable in place (title on blur or
  Enter; tag from a search over Stash's tags, since Stash needs one on every marker and flix's
  default is "Highlight"; `PUT /scenes/:id/markers/:marker`), delete with an Undo toast that
  recreates it. O markers show a droplet. Phone: full-width rows; desktop: two columns. The
  seek-bar ticks and a station's Moments follow the edits at once → [[moments]],
  [[seek-bar-markers]].
- The check script now blocks and logs marker, O and rating writes, so gesture tests prove the
  attempt without touching Stash ([[check-scripts-wrote-plays-to-stash]]).

## How it was verified

Headless touch runs of the hold, Undo and O against a dev BFF with the writes blocked and
logged; the Moments list edited by hand.

## Snags

None recorded.
