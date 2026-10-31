---
title: "2026-10-29: Round 4, a review pass over the whole codebase"
kind: history
summary: Phase 2g, 19 commits in one day, one per initiative: correctness fixes, shared playback and storage modules, file-based routes with code splitting, server speed work, node:test suites, and a batch of features.
tags: [history, review, refactor, tests]
date: 2026-10-29
commits: [8b339ac, 8e22add, 5d9fc4f, 35fcbba, 3917072, efe01a0, c9220ff, 95c6f02, 17b3474, e6f2c6f, bf09526, 95e79d1, fc9a7d0, f2eab41, 8b2cd54, 5755940, aa9bf0f, 30c3b9a, 00e1267]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [one-commit-per-initiative, web-app, 2026-10-29-typed-stash-layer-and-tag-outage]
---

# 2026-10-29: Round 4, a review pass over the whole codebase

The user's work style for this round became a standing rule: [[one-commit-per-initiative]].

## What changed

- **Correctness** (8b339ac): Related and For-you candidates reshuffle daily (`daySeed`; they
  had been frozen by constant seeds); the unused playlist join on every scene load is gone;
  `/readyz` probes Postgres, not Stash; up-next items start playing; the favourites set is
  built once per load → [[related-videos]], [[home-feed]].
- **Players share `lib/playback.ts`** (8e22add): source attach incl. hls.js, watch
  accounting, keys, marker jumps, flash. The station falls back to HLS on a media error,
  records plays and resume points in Full mode, binds its keys once → [[player]], [[stations]].
- One storage helper and one `Switch` (5d9fc4f); one `describeQuery` behind chips, station
  summaries and pinned-row titles (35fcbba); lint clean, hooks out of `ui.tsx`, chapters seek
  through a `PlayerHandle`, selection is a Set (3917072) → [[coding-conventions]].
- **File-based routes** with `autoCodeSplitting` (efe01a0): the main chunk went from 554 kB
  to 256 kB plus a 124 kB shared UI chunk; pages load on intent → [[web-app]].
- **Server speed** (c9220ff): asset hits read no files; facet and tile working sets stay out
  of `data.json` (`VOLATILE`); facets and tiles warmed at boot; `/api` gzip'd (home 108 → 17 kB);
  the session answer persisted → [[caching]].
- **Tests** (95c6f02): `node:test` suites for the filter builder, both caches, byte ranges
  and signed links; run in the image build → [[run-checks]].
- **Features**: installable app with manifest, icons, Apple meta and a standalone Back button
  (17b3474, [[installable-app]]); PiP on `i` and a `?` shortcuts overlay (e6f2c6f,
  [[keyboard-shortcuts]]); scrub sprite frames across a card (bf09526); "Because you watched"
  and "Pick up a station" rows (95e79d1); "Not interested" as a Stash tag excluded like the
  blocklist (fc9a7d0, [[blocklist-and-exclusions]]); an O-counter press marks the moment and
  chapter chips show frames (f2eab41, [[moments]]); deletes say what they free and performer
  cards show age at filming (8b2cd54); discreet mode and a station sleep timer (5755940,
  [[discreet-mode]]); a playlist as a station (aa9bf0f); a card menu on right-click or long
  press (30c3b9a).
- Not done from the review, picked up on 2026-10-30: duplicates workbench, one station
  previews endpoint, splitting `lib/api.ts`.

## How it was verified

Typecheck, lint, `pnpm test`, headless screenshots where UI changed, one push per commit
with the deploy watched ([[deploy-and-verify]]).

## Snags

- Typing the router needed explicit return types and a reducer cast
  ([[route-api-circular-types]]).
- The "Not interested" tag then exposed the id-criterion gap in production
  ([[2026-10-29-typed-stash-layer-and-tag-outage]]).
