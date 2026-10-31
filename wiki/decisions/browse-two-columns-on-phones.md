---
title: Browse shows two columns on a phone
kind: decision
summary: Browse and every SceneBrowser grid render two columns on a phone with compact card meta, no density toggle for now; one column was 1.5 cards per screen.
tags: [mobile, browse, ux]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [browse-and-filters, mobile-first-ui, iphone-first-polish, 2026-10-31-ux-audit]
---

# Browse shows two columns on a phone

**Decided** 2026-10-31 by the user (UX audit decision 12, phone item 10): "two for now".
**Status** current.

## Context

Browse rendered one column on a phone (1.5 cards per screen) while the directories already
showed two; the audit proposed a density toggle defaulting to two.

## Decision

Two columns below `sm` in `SceneBrowser`'s `Grid` (`grid-cols-2`, tighter gaps), with the
card's `compact` layout there (studio name in the meta line instead of the disc). No toggle
for now. `CARD_SIZES` says 50vw on a phone so `srcset` picks the right copy.

## Consequences

Every page built on `SceneBrowser` (Browse, performer, studio, category, playlist grids)
is two columns on a phone. The touch "⋯" button and the two-line title still fit at
~200 px per card.

## Revisit if

the user finds two columns cramped on the iPhone, in which case the density toggle from the
audit (remembered in storage) is the next step.
