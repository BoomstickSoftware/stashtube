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

- [x] `apps/web/public/spike/reels.html` (written 2026-11-10; first iPhone run done for
  picture, sound still to judge: see M0 results): a throwaway page, two `<video>` elements,
  three clips from three files by scene id, a cut, a fade and a dissolve; prints swap latency
  and whether sound survived. Removed before M1 merges.
- [x] `scripts/encode-bench.mjs` (registered; run by the user 2026-11-10, results below; a
  session may not start it, because the pod pulls a Docker Hub image): one minute of video
  through the planned ffmpeg settings in a throwaway pod, prints fps and output bitrate.
  Read-only on the library.
- [x] A pull-request check (`.forgejo/workflows/pr.yml`, unproven until the first pull request): a Forgejo workflow that builds the image's `build` stage (lint,
  tests) on pull requests, without deploying. Today only `main` is built.
- **Exit**: swap latency and sound judged acceptable by the user on the iPhone; fps recorded in
  [[reels-edit-by-reference]]; a red pull request cannot be merged unnoticed.

## M0 results

Measured 2026-11-10. Scene ids only.

### Encode speed (`scripts/encode-bench.mjs`, x264 `slow`, CRF 18, ceiling 16 Mbit/s, 2 CPUs)

| Source | Node | fps | Speed | Output | Wall for 60 s |
|---|---|---|---|---|---|
| 1080p h264, 23.98 fps, 11.9 Mbit/s | talos-eb5-wpp | 6.6 | 0.28x real time | 11.1 Mbit/s | 3 min 37 s |
| 2160p h264, about 30 fps (scaled down to 1080p) | talos-eb5-wpp | 7.1 | 0.24x real time | 9.3 Mbit/s | 4 min 28 s incl. start |

- A 4K source costs about the same per frame as a 1080p one (decoding and scaling it is not
  the bottleneck; the x264 encode is), so reel length and frame rate set the build time, not
  source resolution.
- At 2 CPUs a 20-minute reel takes about 70 to 85 minutes: fine overnight, slow for
  "Build now". The dedicated worker (more CPUs) or a faster preset is what shortens it; neither
  is measured yet.
- CRF 18 landed just under the source's own bitrate, so the 16 Mbit/s ceiling did not bind.
- The `flix` namespace has a ResourceQuota (`laravel-tier`: `limits.memory` 4Gi, `requests.cpu`
  1, `limits.cpu` 6, 20 pods) besides the LimitRange (2 CPUs, 2Gi per container). With flix
  running, one 2Gi bench pod fits and a second does not: "exceeded quota: laravel-tier" means
  an earlier pod is still there (`kubectl -n flix get pods -l app=encode-bench`).
- An interrupted run used to leave its pod encoding and holding the quota; the script now
  deletes it on Ctrl-C. A run moved to the background by a 120 s timeout keeps going.
- ffmpeg's progress lines end in a carriage return, so `kubectl logs` shows none of them until
  the encode ends; the script reads the last one after the pod succeeds.

### Two-element playback on the iPhone (`/spike/reels.html`, Safari, iPhone 17 Pro Max)

- First version: the first clip froze on a still frame after its seek, with no sound; pressing
  Stop then Start made the whole run work, cuts included. Likely cause (not seen in a log): the
  second element was started **with sound** inside the tap to unlock it, and iOS paused the
  first when a second audible video began.
- Fix, confirmed by the user for picture: start the second element **muted** inside the tap,
  pause it, and unmute it only when its clip begins. All seven clips and six changes then run
  on the first Start. The real player must unlock its second element the same way.
- Headless Chrome on the Mac (not WebKit): next clip ready in 61-305 ms, swap wait 33-51 ms.
- **Still open**: sound in every clip, whether a dissolve can sound both videos at once
  (`firstPausedBySecond`), whether Web Audio routing lets a fade change volume, and the
  iPhone's own swap timings. The user tests sound next; results get added here.

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
  job's service account, a Role letting flix create and read Jobs in its namespace. The `flix`
  namespace's LimitRange caps a container at 2 CPUs and 2Gi (found 2026-11-10), so the job
  needs its own namespace or a raised limit.
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
