---
title: "2026-10-31: UX audit Phase 4, desktop polish and loading states"
kind: history
summary: Related capped at 8 with a "More like this" grid, stations after Featured, About as a real button with deduped links, cover placeholders, directory and playlist skeletons, "Filter" chips on touch.
tags: [ux, desktop, mobile, audit]
status: record
date: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
related: [2026-10-31-ux-audit, 2026-10-31-ux-phase2-3-web, roadmap, scene-page, related-videos, home-feed, people-pages, stations, playlists-and-favorites, mobile-first-ui, mobile-checks]
---

# 2026-10-31: UX audit Phase 4, desktop polish and loading states

The remaining web items of Phase 4 of [[roadmap]]: desktop audit items 10, 13, 14, 26 and 27
and phone items 7 and 11 (`docs/audits/2026-10-31-ux/`). All in `apps/web/src`; no server
change.

## What changed

- **Scene page, Related** ([[scene-page]], [[related-videos]]): from `lg` the sidebar lists
  the first 8 of the 24 related videos and the other 16 are a **More like this** `SceneCard`
  grid under both columns (3 columns at 1024, 4 at 1440, 5 at 1920). Below `lg` nothing
  changed (all 24 rows). A playlist's Up next is not capped. `SIDEBAR_MAX` in `Scene.tsx`.
- **Scene page on touch** ([[scene-page]], [[mobile-first-ui]]): the "+" next to the studio
  and under each performer is a labelled **Filter** chip ("In filters" once added), 44 px
  tall; `AddFilterButton` gained `variant="chip"`. The tag chips keep their "+".
- **Home** ([[home-feed]]): "Pick up a station" renders after the Featured row (first when
  there is no Featured row); its height hold while loading is unchanged.
- **Performer header** ([[people-pages]]): About is a ghost `Button` with the facts count,
  `aria-expanded` and a chevron, hidden when there is nothing to show; the links are deduped
  (host + path, `www.`/slash/case ignored, a malformed URL skipped) behind a **Links (N)**
  disclosure, each link a chip (44 px on touch). `Button` in `ui.tsx` accepts `aria-expanded`.
- **Stations** ([[stations]]): each cover has a neutral `bg-surface` block under it that
  pulses until the previews request and the first picture have loaded (`onLoad`), a still
  Radio mark when a station has no cover at all; images `decoding="async"`; the saved list is
  three card skeletons while it loads.
- **Directories and the playlist page** ([[people-pages]], [[playlists-and-favorites]]):
  tile skeletons in each directory's own grid (performers 12 portraits; studios 10 tiles, or
  10 rows in Table view; categories 12 big + 16 small) and a playlist page frame (cover-card
  skeleton, `HeaderSkeleton shape="playlist"`, plus six row bones). `bone` / `Bone` moved to
  `ui.tsx` so every skeleton shares one style (`animate-pulse motion-reduce:animate-none`,
  `role="status"`).
- **`desktop-check`** ([[mobile-checks]]): optional `LATENCY=<ms>` delays `/api` and
  `/media` answers so a scenario can photograph loading states.

## Choices and why

- **Cap + grid, not a sticky sidebar.** A sticky sidebar with its own scroll puts a nested
  scroll region under the mouse wheel (the page stops scrolling while the pointer is over the
  list, and the list's scrollbar is either visible or hidden with no affordance), and it does
  nothing when the main column is shorter than the viewport. Eight rows end where the title,
  actions and performer strip end at both 1440×900 (sidebar bottom y≈950) and 1920×1080
  (y≈990), so the two columns balance, and the overflow becomes cards with hover previews and
  the card menu rather than 16 more compact rows. Eight rather than the audit's ten because
  ten overran the performer strip at 1440.
- **Stations below Featured, not beside the hero.** Beside the hero would be a third thing in
  the hero's right column (eyebrow, title, Play) with two 260 px tiles, a second layout to
  maintain below `xl`, and the hero's height would depend on it. After Featured, the first
  row under the hero is 24 cards to browse: Featured's heading sits at y=650 at 1440×900 and
  y=810 at 1920×1080, above the fold both times (it was at y≈960 before), and the resume
  tiles are the second row at every width.
- **Links labelled by host, numbered when a host repeats** rather than collapsed to one per
  host: two different pages on iafd.com are both worth keeping; the exact duplicates (28 of
  the raw list on performer 447 remained, from a longer list with repeats) are gone.
- **A JS media query (`pointer: coarse`) for the chips** rather than rendering the badge and
  the chip and hiding one with CSS: the performer column changes width with it, and two
  elements per performer would double the buttons in the accessibility tree.

## How it was verified

- `node scripts/check.mjs`: typecheck, web tsc, lint 5 warnings (baseline 5), 105 tests.
- `desktop-check` at 1440×900 and 1920×1080 against production through Vite on :5183 (writes
  blocked): 8 rows in the sidebar, `More like this` with 16 cards; Featured at y=650 / 810 and
  "Pick up a station" at y=1058 at 1440; About opened by its button text and listed 28 deduped
  links; screenshots read.
- `LATENCY=2500 desktop-check` with a 1.8 s scenario wait: performer, studio, category tile
  skeletons, the playlist frame and the station card skeletons with the pulsing cover blocks,
  all in the real grids; the loaded pages followed without moving.
- `mobile-check` at 440 px on `/scene/2775`, `/stations`, `/performers`, `/performer/447`,
  `/`, `/playlists`: no horizontal overflow; the Filter chips and the About button read.

## Snags

- `LATENCY` first used `Network.emulateNetworkConditions`: Vite's module chain then took
  longer than any scenario waited and every page shot white. Then a `Fetch` pattern
  `*/api/*`, which also matched `/src/lib/api/*.ts`. The script now pauses every request and
  delays only paths under `/api/` or `/media/`.
- The first scenario of a fresh profile paints the layout's own spinner for the session and
  settings requests before any page skeleton, so a loading-state shot belongs in a later
  scenario of the file, or after a longer `wait`.
- Not done: inline facts in the header's empty area at `lg` (audit 14's second half) — the
  facts stay in the About panel, which now opens from a real button; the History list
  skeleton (audit 27 mentions it) was out of scope.
