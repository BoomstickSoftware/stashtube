---
title: Home rows keep 24 cards and render lazily
kind: decision
summary: The feed keeps 24 cards per row; the cost is cut by rendering rows below the fold lazily, not by shrinking rows to 12 with "See all".
tags: [home, performance]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [home-feed, 2026-10-31-ux-audit]
---

# Home rows keep 24 cards and render lazily

**Decided** 2026-10-31 (UX audit roadmap, [[2026-10-31-ux-audit]]). **Status** current.

## Context

Home renders about 260 cards and 456 images at once (7,481 nodes, a 127 ms long task on the phone); the audit offered 12 cards per row with "See all" or lazy rendering ([[2026-10-31-ux-audit]], client F2).

## Decision

Keep 24. Rows below the fold render lazily (`content-visibility: auto` with an intrinsic size, or mount on intersection); the hero's state lives in the hero ([[2026-10-31-ux-phase0-web]]).

## Consequences

Phase 2 implements the lazy rows; the feed payload is unchanged.

## Revisit if

the phone's first paint of Home is still over 300 ms of script after lazy rows.
