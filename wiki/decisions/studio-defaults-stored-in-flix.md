---
title: Studio default categories are stored in flix and synced add-only, with provenance
kind: decision
summary: Default categories per studio live in Postgres, apply to the studio's own videos only, are put back if removed by hand, and come off only where flix added them.
tags: [studios, tags, stash, sync]
status: current
decided: 2026-11-09
by: user
verified: 2026-11-09
updated: 2026-11-09
related: [studio-default-categories, stash-owns-activity, data-model, cast]
---

# Studio default categories are stored in flix and synced add-only, with provenance

## Context

The user wanted to set categories on a studio once and have every downloaded video of it carry
them. Neither Stash nor Whisparr does this: Stash studios have their own tags, but nothing copies
them onto scenes (Identify and Auto Tag do not), and Whisparr's tags only steer Whisparr.

## Decision

- **Stored in flix** (`studio_categories`), not as the studio's tags in Stash: Stash's studio tags
  may already hold categories from elsewhere, and only flix's own list should reach the videos.
  This is an exception to "Stash owns tags" ([[stash-owns-activity]]) for the *setting*; the
  categories on the videos still live in Stash.
- **The studio's own videos only**: an umbrella studio's sub-studios have their own niches.
- **Put back if removed by hand**: manual removal should be rare; a per-video exception was
  declined until it is needed.
- **Removal with provenance**: flix records which videos it added each category to
  (`studio_category_adds`); a category taken off a studio comes off only those videos, never
  ones that had it from Stash or StashDB.
- **Runs after each start and Stash change** (with the Cast sync), on save, and from Settings,
  rather than on a clock: new videos only arrive with a scan.
