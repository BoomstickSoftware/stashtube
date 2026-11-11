---
title: Reels engineering roadmap
kind: hub
summary: The build order for reels: six milestones, each a branch and one squash-merged pull request, with its work items, tests, exit test and the repos it touches.
tags: [reels, roadmap, planning, architecture]
status: current
verified: 2026-11-10
updated: 2026-11-10
related: [reels-edit-by-reference, reels-branch-and-squash-merge, build-a-feature-on-a-branch, roadmap, data-model]
---

# Reels engineering roadmap

The design and every decision: [[reels-edit-by-reference]]. How the work is branched, merged and
reverted: [[build-a-feature-on-a-branch]]. Status lives here; tick an item when it is merged.

## Rules for every milestone

- One branch (`reels/m<n>-<topic>`, the first is `reels`), one pull request, **squash-merged**:
  one commit on `main` per milestone, so `git revert <sha>` takes a milestone back out.
- `main` stays deployable. Everything reels sits behind the server flag `features.reels`
  (`FLIX_REELS=1`, off in production until M1's exit test passes on the phone).
- Migrations are additive (new tables only) and never touch an existing table, so a revert
  leaves harmless empty tables; a later migration drops them if reels is abandoned.
- The existing rules hold: only `@flix/shared` types cross to the web; reel plays, resume and
  rating go through `guardWrite()` / `isPrivate()`; logs and scripts print ids
  (`scripts/lib/neutral.mjs`); checks against Stash do not write.
- Done means: `check.mjs` green, tests for every pure function named below, a neutral
  `phone-flow` run of the new screens, wiki pages for the feature and its decisions, the
  milestone ticked here.

## M0. Measure (branch `reels`, no product code)

- [x] `apps/web/public/spike/reels.html` (written 2026-11-10; the user's iPhone run is pending): a throwaway page, two `<video>` elements, three clips
  from three files by scene id, a cut, a fade and a dissolve; prints swap latency and whether
  sound survived. Removed before M1 merges.
- [ ] `scripts/encode-bench.mjs` (registered): runs one minute of 1080p through the planned
  ffmpeg settings in a pod on a named node, prints fps and output bitrate. Read-only on the
  library.
- [x] A pull-request check (`.forgejo/workflows/pr.yml`, unproven until the first pull request): a Forgejo workflow that builds the image's `build` stage (lint,
  tests) on pull requests, without deploying. Today only `main` is built.
- **Exit**: swap latency and sound judged acceptable by the user on the iPhone; fps recorded in
  [[reels-edit-by-reference]]; a red pull request cannot be merged unnoticed.

## M1. Reels in the app (large, flix only)

- [ ] Migration: `clips`, `reels`, `reel_items` (drizzle; [[database-migrations]]).
- [ ] `packages/shared/src/reels.ts`: types and the pure `planReel(reel) → Segment[]` (clips,
  transitions, overlaps, total length, virtual-time ↔ clip-time mapping). Fully unit-tested;
  both players and the build consume it.
- [ ] `apps/server/src/reels.ts` + `routes/reels.ts`: CRUD, reorder, `idParam` validation, a
  source check (duration and fingerprint against Stash) that marks a clip shifted or missing.
- [ ] Web: In/Out marking in the Player; "Add to reel" sheet; the reel editor (timeline,
  filmstrip trimmer from sprites, transition per join and reel default); `ReelPlayer` built on
  `lib/playback.ts` with two elements and the `planReel` timeline in the shared `SeekBar`.
- **Exit**: the user builds a reel of five clips from three videos on the phone and previews it
  with cuts and fades.

## M2. Compatibility badge (small, flix only)

- [ ] `packages/shared`: `compatibility(playback) → 'everywhere' | 'device' | 'transcode'` from
  container and codecs, unit-tested against the census in [[stash-library]].
- [ ] The badge on cards' meta line and the scene page; a Browse filter.
- **Exit**: the 260 non-MP4 videos, and only those, read "transcodes".

## M3. Build pipeline (medium to large; flix, k8s and nas repos)

- [ ] nas repo: a writable export for reels and scratch, read-write to the render worker only.
- [ ] k8s repo: the render worker VM (8 vCPU, 8 GB, ballooning, low `cpuunits`), its taint, the
  job's service account, a Role letting flix create and read Jobs in its namespace.
- [ ] `apps/render/`: a small image (ffmpeg + a Node script) that takes a plan, probes each
  source, renders each clip and each transition to an intermediate keyed by a content hash
  (fit to 1080p with bars, dominant frame rate, loudness, quality-targeted bitrate with both
  ceilings), joins by copy, writes sprites, reports progress. Pure parts tested: the ffmpeg
  argument builder, bar geometry, the bitrate ceiling, the intermediate key.
- [ ] Migration: `reel_builds`. `apps/server/src/reelBuilds.ts`: the queue, one job at a time,
  a `jobs.ts` entry gated on "something is queued and it is the window or Build now", progress
  and failure with a reason, stale detection by plan hash.
- [ ] Media proxy: signed playback of a built reel from the reels mount ([[media-proxy]]).
- **Exit**: a queued reel builds overnight, survives a killed job, and plays on the TV.

## M4. Review and listing (medium, flix only)

- [ ] Migration: `reel_people`, `reel_tags`, and rating, resume, plays on `reels`.
- [ ] Proposed details from the contributing scenes (screen-time weighting, pure and tested).
- [ ] "Ready for review" strip on Home; the review page; approve and send back.
- [ ] Reels in the Browse strip, in search, and as shelves on performer and category pages.
- **Exit**: an approved reel is found by search and from a performer's page, and resumes.

## M5. Refinement (by appetite)

- [ ] Dissolve in the build. Reels proposed from markers. Cropping baked-in bars.

## Order and dependencies

M0 gates everything. M1 and M2 are independent of each other and of infrastructure. M3 needs
M1's `planReel` and the two other repos. M4 needs M3. Each merges on its own.
