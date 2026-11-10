---
title: The scene page's ⋯ menu
kind: history
summary: Initiative E of the strategy review: the scene page keeps Stars, O, Favorite and Playlist in its row and moves the rest into the card's own menu behind ⋯.
tags: [scene-page, ui, mobile]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [scene-page, browse-and-filters, 2026-11-09-strategy-review, roadmap]
---

# The scene page's ⋯ menu

Initiative E of [[roadmap]] ([[2026-11-09-strategy-review]]).

## What changed

- The action row is Stars, O, Favorite, Playlist and ⋯. Unlist left the row; the details card
  lost its Remove from Continue, Identify and Delete buttons.
- ⋯ opens `CardMenu` with a `page` prop: no Play, Favorite or Playlist; Unlist toggles back
  ("Unlisted: show on Home again"); Identify added; Delete navigates back once done. Mark as
  watched is on the page for the first time. Remove from Continue now toasts from cards too.
- Identify's state moved out of its button into `useIdentify` (`lib/identify.ts`), owned by the
  page, so the run is still polled and shown (`IdentifyStatus`) after the menu closes.

## Verified

`node scripts/check.mjs`; phone screenshots of the row and the sheet on a video with a resume
point. On a phone the row still wraps to two lines (stars, O, Favorite / Playlist, ⋯), one item
fewer than before.
