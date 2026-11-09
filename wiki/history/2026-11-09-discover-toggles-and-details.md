---
title: "2026-11-09: Discover toggles, details and StashDB links"
kind: history
summary: Discover gained Not in motion, Show blocked & VR and Details chips, hover details for a mouse, and an open-on-StashDB button on every StashDB card.
tags: [discover, stashdb]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [discover, 2026-11-09-discover-hides-vr]
---

# 2026-11-09: Discover toggles, details and StashDB links

## What changed

- `fresh=1` (Not in motion) and a page control for `unblocked=1` (Show blocked & VR);
  `DiscoverPage.inMotion` counts what Not in motion left out (commit cbf665f, pushed by a command
  the user had stopped; it had already run).
- `WantedScene.tags`, `code`, `stashdbAdded` from the mirror; Details chip (per browser) shows
  them under each card, a mouse hover over the picture otherwise.
- `Features.stashdbWeb` and a new-tab StashDB button on every card with a StashDB id.

## How it was verified

- `node scripts/check.mjs`.
- `scripts/phone-flow.mjs` at 440×956 with `/api/features` and `/api/discover` stubbed (production
  did not serve the new fields yet): chips wrap with no overflow, every chip and the StashDB button
  44 px, the link `https://stashdb.org/scenes/<id>` with `target=_blank`, Details shows code, date
  and categories and is remembered, the footer counts blocked, VR and in-motion scenes.
