---
title: The UI says "Categories" and spells in US English
kind: decision
summary: Tags are called Categories everywhere in the UI (nav, page, Settings, Filters, search); UI copy uses US spelling (Favorites, center); the wiki may keep UK spelling.
tags: [ux, copy, vocabulary]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [people-pages, browse-and-filters, 2026-10-31-ux-audit]
---

# The UI says "Categories" and spells in US English

**Decided** 2026-10-31 (UX audit roadmap, [[2026-10-31-ux-audit]]). **Status** current.

## Context

The nav and the directory page said Categories while the tag page, Settings' Blocklist, the Filters dialog, search results and the scene page said tag or Tags; buttons said Favorite while rows, chips, Privacy copy and the Featured dials said favourite and centre ([[2026-10-31-ux-audit]], IA F2 and F12, desktop finding 8).

## Decision

One word: **Categories** (the tube-site word the user chose) wherever the user reads it: the tag page eyebrow, the Blocklist group, the Filters dialog, search subtitles, "Filter categories", "Edit categories". The API, the code and the wiki keep `tag`. UI copy uses **US spelling**; the wiki stays UK.

## Consequences

A copy pass across the web app (Phase 5); `describe.ts`, `Stations.tsx`, `api.ts` row titles, `FeaturedDials.tsx`, `Privacy.tsx`. New copy follows the rule.

## Revisit if

Stash's own vocabulary ever has to show through (an edit UI that mirrors Stash's tags).
