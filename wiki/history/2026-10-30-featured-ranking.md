---
title: "2026-10-30: Featured ranking with dials"
kind: history
summary: Phase 2h: Home's first row and Tonight's pick come from a weighted, seeded scoring pass with ten signals and user-set dials; the first deploy crash-looped on a missing shared package.
tags: [history, home, featured, incident]
date: 2026-10-30
commits: [ad8a99e, 678db44, a0408f3, b75ebd3]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [featured-ranking, shared-package-missing-from-image, 2026-10-29-round-4-review]
---

# 2026-10-30: Featured ranking with dials

## What changed

- The user asked for a weighted, seeded ranking with sliders rather than a hard-coded sort:
  a slight preference for long-unseen and long-ago-downloaded content, favourite tags and
  performers, most watched, most marked.
- `apps/server/src/featured.ts` (ad8a99e): ten signals, each rank-normalised 0..1 (dormant,
  shelf age, fresh, performer, tag, studio, watched, marked, rated, O-counter), times a
  weight from -1 to 1, plus `surprise` × a hash of the scene id and the visit's seed. At most
  two picks per performer and three per studio; every pick carries a `why` line. Weights
  live in the `settings` table, shared across devices ([[single-user-no-login]]); the seed is
  one per page load and Shuffle draws another. Settings previews the top 12 live while
  dragging (`POST /api/featured/preview`). Tests in `featured.test.ts` → [[featured-ranking]].

## How it was verified

`featured.test.ts`; the Settings preview strip; the deploy watched to `/healthz`.

## Snags

- The first deploy crash-looped: `featured.ts` imported `FEATURED_DEFAULTS` from
  `@flix/shared` and the runtime image carried no shared source. Two commits moved the
  defaults out (678db44, a0408f3), then b75ebd3 shipped `packages/shared/src` in the image
  instead so the defaults have one home, pinned by `imports.test.ts`
  ([[shared-package-missing-from-image]], [[shared-contract]]).
