---
title: Page grids overflow the phone width unless the column is pinned
kind: gotcha
summary: An implicit CSS grid column grows to its widest child and the layout root clips it, so scene and playlist pages ran off the phone's edge; page grids pin the mobile column with grid-cols-1 (minmax(0,1fr)).
tags: [css, mobile, layout, tailwind]
symptom: "Content cut off at the right edge of the phone screen; mobile-check reports horizontal overflow"
found: 2026-10-28
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/web/src/pages/Scene.tsx, apps/web/src/pages/Playlists.tsx]
related: [mobile-first-ui, mobile-checks]
---

# Page grids overflow the phone width unless the column is pinned

## Symptom

On an iPhone the scene and playlist pages were wider than the screen: text and buttons were
cut off at the right edge and the page could not be panned to reach them, because the layout
root clips overflow. `scripts/mobile-check.mjs` reported the overflow (2026-10-28).

## Cause

A grid without an explicit column track gets an implicit `auto` column, whose minimum width
is its widest child (a long title, an unbreakable path). The column grows past the viewport
and the clipped root hides the excess.

## Fix

Page grids declare `grid-cols-1`, which Tailwind renders as `minmax(0, 1fr)`: the track may
shrink to zero and the content wraps or truncates instead (7a6a524).

## Avoid

Every new page-level grid starts from `grid-cols-1` and widens at breakpoints. Run
[[mobile-checks]] on any new page; the overflow line is the tell. See [[mobile-first-ui]].
