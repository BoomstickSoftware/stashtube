---
title: "2026-11-09: Discover leaves VR out"
kind: history
summary: A Settings switch, on by default, leaves VR scenes (by title, category or studio name) out of Discover; Show blocked brings them back.
tags: [discover, stashdb, settings]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [discover, settings-page]
---

# 2026-11-09: Discover leaves VR out

## What changed

- `settings.hideVr` (default on), Settings → Library switch, `isVrScene` in `catalog.ts`;
  `DiscoverPage.vr` counts what it left out, shown in Discover's footer.

## How it was verified

- `node scripts/check.mjs`; `vr.test.ts` covers title, category and studio matches and near
  misses (words containing "vr", a studio with the letters inside a word or "Virtual" later on).
- After deploy: Discover answered with the `vr` count (see the deploy of this commit).

## Snags

- The privacy check refused a real studio name in the pattern and its test; the rule became
  "starts with Virtual", which covers it without naming it.
