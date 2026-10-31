---
title: The library leads a performer or studio page; the wanted shelf follows, collapsed
kind: decision
summary: On performer and studio pages the user's own videos come first; the "Not in your library yet" shelf sits below them as a heading with its count, expanded on tap, remembered per browser.
tags: [ux, performer, studio, whisparr, stashdb]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [whisparr-shelf, people-pages, 2026-10-31-ux-audit, 2026-10-31-covers-shelf-skeletons]
---

# The library leads a performer or studio page; the wanted shelf follows, collapsed

**Decided** 2026-10-31 (UX audit roadmap, [[2026-10-31-ux-audit]]). **Status** current.

## Context

The shelf of StashDB scenes not in the library was rendered above the library's grid on every device ([[whisparr-shelf]]). The audit found the user's own 57 videos starting below the fold at 1440×900, 1920×1080 and on the phone, and the shelf's late arrival (0.5–0.9 s) shifting the page (CLS 0.13–0.17).

## Decision

Render the library (filter bar and grid) first. The shelf follows as a collapsed heading, "Not in your library yet · N on StashDB", that expands on tap into the Row/Grid views and remembers open/closed per browser (`flix.wanted.open`). Reserve no space for it while it loads: below the grid nothing above it moves.

## Consequences

Finding a performer's scene is one scroll shorter; the page no longer shifts; the shelf is one tap further for the user who came to fetch.

Implemented 2026-10-31 ([[2026-10-31-covers-shelf-skeletons]]): `WantedShelf` renders after `SceneBrowser` in `Performer.tsx` and `Studio.tsx`, as a heading button with `aria-expanded`; `flix.wanted.open` through `useStored(..., asBool(false))`; the count is the first page's `items.length` with "+" while `hasNextPage` (the API has no total that excludes what is already in the library). The first page is still fetched while closed (for the count), no cover is. Because the shelf follows the library's own infinite grid, a long library is scrolled through, page by page, before the shelf is reached; the trade accepted here is that the fetcher scrolls, the browser does not. Nothing above the shelf is reserved or moved: it appears, closed, when its page arrives.

## Revisit if

fetching from the phone becomes the main reason to open a performer page.
