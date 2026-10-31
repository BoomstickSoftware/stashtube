---
title: "2026-10-31: UX audit Phase 0, the web quick wins"
kind: history
summary: Small fixes across twenty web files from the audit's phone, desktop and client findings (landscape header, Pin sheet, 44 px targets, gutters, labels, memoised cards, image sizes, poster, hover cost), verified headless.
tags: [ux, mobile, desktop, performance, audit]
status: record
date: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
related: [2026-10-31-ux-audit, roadmap, mobile-first-ui, mini-player, mobile-checks, perf-checks]
---

# 2026-10-31: UX audit Phase 0, the web quick wins

The "phone", "desktop" and "client" lines of Phase 0 in [[roadmap]], from
[[2026-10-31-ux-audit]]. Server and freshness lines shipped as their own initiatives.

## What changed

- **Phone**: the phone layout (icon header, tab bar, docked strip) now holds up to `lg`, so a
  landscape phone keeps its header (the Settings gear was clipped before); the "Pin to home"
  form is a bottom sheet portalled to `<body>` on touch (inside the filter bar, whose
  backdrop-filter made `fixed` relative to it, it painted behind the first card); 44 px
  targets on touch for header icons, chips, stars, the Filters button, the sort pill, card
  heart and save, "+" badges, the title pencil and search Clear; the shelf hint and Row/Grid
  labels show on phones; Keyboard and Panic key sections hide on touch (decision: the panic
  key is desktop-only); the "hold to mark" pill waits until 3 s of playback and Moments' copy
  of it is keyboard-only; Categories' filter and sort chips share a row that wraps as one;
  the Performers sort chips fade at the edge instead of cutting a word.
- **Desktop**: `scroll-pl` on the three snap rows (cards no longer sit flush at x=0);
  `aria-label` on thumbnail and studio links and the big play button; hover-only card buttons
  show on keyboard focus; the sort control has a focus ring; counts formatted in entity
  headers; Continue / History / Stats share one wrapper width; studio logos sit on a dark
  disc (white logos vanished on white); shortcut key caps keep their height; the empty list
  offers "Clear filters"; the 404 says what to do and links Home; the performer's own name is
  left off the cards on her page (`omitPerformer`).
- **Client**: `SceneCard` and `Row` are `React.memo` with stable props (`onToggle(id)`,
  `selecting`/`selected` booleans, a memoised flattened list in `SceneBrowser`); the hero's
  index lives in `Hero`, so its 12 s tick no longer re-renders Home's ~260 cards; the poster
  is the 960 variant (163 KB → ~35 KB); `sizes` per placement (rows, Featured preview, tag
  tiles) instead of the grid's; hover delay 500 ms with the VTT fetched after it and preview
  clips `preload="metadata"`; the NEW badge is always visible at 80 %; card meta at full
  muted contrast; `motion-reduce` on the card zoom.

## How it was verified

`node scripts/check.mjs` clean (one new React Compiler warning fixed by declaring the
setters as dependencies). `mobile-check` on `/`, `/browse`, `/performer/447`, `/settings`,
`/tags`, `/scene/2775` portrait, `/` and `/browse` landscape, and `DESKTOP=1` on `/`,
`/browse`, `/performer/447`, `/history`, `/nope`: no overflow anywhere; the landscape header
shows all five icons; the dark studio discs read; the badge shows. `mini-check`: all three
restore paths. Screenshots were read, not just taken.

## Snags

- The shelf heading on a phone now wraps to three lines (title, hint, toggle); Phase 3 moves
  the shelf below the library and collapses it (decision D2), which resolves it.
- Not re-measured with `perf-check` yet; the append-cost and idle-task targets are checked
  when Phase 2 lands.
