---
title: Mark a moment on a phone with a long press on the picture
kind: decision
summary: One gesture (hold the picture half a second) marks a moment without pausing, with Undo and an O upgrade on a banner, and a Moments list under the video for later edits; not a bar button or a floating button.
tags: [ux, touch, markers, player]
status: current
decided: 2026-10-30
by: user
verified: 2026-10-30
updated: 2026-10-30
related: [moments, seek-bar-markers, player]
---

# Mark a moment on a phone with a long press on the picture

**Decided** 2026-10-30 by the user. **Status** current.

## Context

Marking a moment on a phone took pause → gear → Mark → close → resume. Three options were
offered: a button in the control bar, a floating button over the picture, or a long press on the
picture.

## Decision

The long press. Holding the picture for half a second marks the current time without pausing or
showing the controls, with a pulse under the finger; a 5 s banner offers Undo and an O upgrade
(the O-counter press that also retitles the marker `O`). The user also asked to "come back to
the video at any time to see the list of marks and update them": the Moments list
([[moments]]).

## Consequences

- The hold exists in both players; `b` and the gear item show the same banner.
- A hint teaches it on the first three videos on a touch device.
- The check script blocks marker, O and rating writes so the gesture can be tested headless
  ([[prod-checks-read-only]]).
- Do not add a visible Mark button to the touch control bar.

## Revisit if

The hold conflicts with another gesture (today a tap toggles controls and a double tap seeks).
