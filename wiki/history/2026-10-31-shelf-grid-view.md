---
title: "2026-10-31: Row or grid for the Not-in-your-library shelf"
kind: history
summary: The shelf on performer and studio pages gained a Row/Grid toggle remembered per browser; Grid loads the next StashDB page as the bottom scrolls into view.
tags: [whisparr, stashdb, performers, studios, ui]
status: record
date: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
related: [whisparr-shelf, people-pages, mobile-checks, scripts-library]
---

# 2026-10-31: Row or grid for the Not-in-your-library shelf

## What changed

- `WantedShelf` (`apps/web/src/components/WantedRow.tsx`) renders a Row/Grid radio group in
  the shelf heading. Row is the carousel as before; Grid is a responsive grid (2 to 5 columns)
  with a `Sentinel` that fetches the next page, replacing "Show more" ([[whisparr-shelf]]).
- The choice is per browser (`flix.wanted.view`), the same pattern as the Studios views.
- The Home row keeps the carousel and has no toggle.

## How it was verified

`node scripts/check.mjs` (80 tests, 5 lint warnings at baseline). Headless against production
through Vite (`FLIX_SERVER=http://flix.lan`, writes blocked, [[mobile-checks]]) on
`/performer/447`: Row shows 24 cards and the toggle, no overflow; an `EVAL` that clicks Grid
and scrolls the last card into view goes from 24 to 46 cards; desktop at 1440 px shows four
columns. Deployed with `scripts/deploy-check.mjs`.

## Snags

- Testing the infinite grid with `scrollTo(0, scrollHeight)` loads the library's next page,
  not the shelf's: the page bottom is far below the shelf's sentinel. `scrollIntoView` on the
  shelf's last card is the right probe (noted in [[mobile-checks]]).
