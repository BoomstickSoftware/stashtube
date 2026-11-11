---
title: Reels engineering roadmap
kind: hub
summary: The build order for reels: six milestones, each a branch and one squash-merged pull request, with its work items, tests, exit test and the repos it touches.
tags: [reels, roadmap, planning, architecture]
status: current
verified: 2026-11-11
updated: 2026-11-11
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

- [x] `apps/web/public/spike/reels.html` (written 2026-11-10; the user's iPhone runs passed
  for picture and sound, 2026-11-11: see M0 results): a throwaway page, two `<video>` elements,
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

On the NAS (N5105, 4 cores), with the ffmpeg inside the Stash container
(`node scripts/encode-bench.mjs --nas [--encoder vaapi]`, niced, nothing pulled):

| Source | Encoder | fps | Speed | Output |
|---|---|---|---|---|
| 2160p h264, about 30 fps (scene 1783, the same as above) | x264 `slow`, CRF 18 (30 s) | 8.4 | 0.28x real time | 8.6 Mbit/s |
| 2160p h264, about 30 fps (scene 1783) | VAAPI, QP 20 (60 s) | 117 | 3.9x real time | 13.4 Mbit/s |
| 1080p h264 (scene 438) | VAAPI, QP 20 (60 s) | 222 | 9.25x real time | 6.9 Mbit/s |

- Quick Sync on the NAS (hardware decode, scale and encode) is 14 to 33 times faster than
  software x264 on 2 cluster CPUs: a 20-minute reel in about 2 to 5 minutes. Its picture
  quality at these settings has **not** been compared with x264 CRF 18; hardware H.264 usually
  needs more bits for the same quality. The VAAPI run does not add bars (plain
  `scale_vaapi`), so the build's fit-with-bars step is untested on this path.
- Software x264 on the NAS's four cores is no faster than 2 cluster CPUs, and it took the
  NAS's load average from 1 to 7 while it ran.
- On these numbers the user moved the build to the NAS (2026-11-11, [[reels-edit-by-reference]]).

- A 4K source costs about the same per frame as a 1080p one (decoding and scaling it is not
  the bottleneck; the x264 encode is), so reel length and frame rate set the build time, not
  source resolution.
- At 2 CPUs a 20-minute reel takes about 70 to 85 minutes: the reason the build
  left the cluster.
- CRF 18 landed just under the source's own bitrate, so the 16 Mbit/s ceiling did not bind.
- The `flix` namespace has a ResourceQuota (`laravel-tier`: `limits.memory` 4Gi, `requests.cpu`
  1, `limits.cpu` 6, 20 pods) besides the LimitRange (2 CPUs, 2Gi per container). With flix
  running, one 2Gi bench pod fits and a second does not: "exceeded quota: laravel-tier" means
  an earlier pod is still there (`kubectl -n flix get pods -l app=encode-bench`).
- An interrupted run used to leave its pod encoding and holding the quota; the script now
  deletes it on Ctrl-C. A run moved to the background by a 120 s timeout keeps going.
- ffmpeg's progress lines end in a carriage return, so `kubectl logs` shows none of them until
  the encode ends; the script reads the last one after the pod succeeds.

### Encoder comparison on the NAS (2026-11-11, 40 s of each source, output 1080p)

`node scripts/encode-bench.mjs --nas --scene <id> --seconds 40 --ssim --keep <dir>` per
variant. Likeness is SSIM against the source scaled to 1080p, in dB (higher is closer; a
number, not a judgement of how it looks).

| Variant | Scene 438 (1080p source, 12.6 Mbit/s) | | | Scene 1783 (4K source, 15.7 Mbit/s) | | |
|---|---|---|---|---|---|---|
| | Speed | Mbit/s | Likeness | Speed | Mbit/s | Likeness |
| Quick Sync QP 18 | 9.2x | 9.7 | 20.6 dB | 3.9x | 17.2 | 20.2 dB |
| Quick Sync QP 22 | 9.2x | 4.4 | 18.9 dB | 4.0x | 8.3 | 18.5 dB |
| Quick Sync QP 26 | 9.2x | 2.6 | 17.1 dB | 4.0x | 4.7 | 16.8 dB |
| x264 `veryfast` CRF 18 | 1.4x | 5.9 | 20.1 dB | 0.74x | 8.5 | 19.5 dB |
| x264 `slow` CRF 18 | 0.38x | 6.3 | 20.6 dB | 0.26x | 8.9 | 20.0 dB |

- Quick Sync reaches x264 `slow`'s likeness at QP 18, but spends about 1.5 to 2 times the
  bits to do it (and on the 4K source more than the source itself: the "never above the
  source" ceiling would have to apply).
- x264 `veryfast` is a middle road: close to `slow` in likeness and size, about real time.
- **Chosen by the user 2026-11-11, from a blind A/B page of these files: Quick Sync QP 18**
  ([[reels-edit-by-reference]]).

### Two-element playback on the iPhone (`/spike/reels.html`, Safari, iPhone 17 Pro Max)

- First version: the first clip froze on a still frame after its seek, with no sound; pressing
  Stop then Start made the whole run work, cuts included. Likely cause (not seen in a log): the
  second element was started **with sound** inside the tap to unlock it, and iOS paused the
  first when a second audible video began.
- Fix, confirmed by the user for picture: start the second element **muted** inside the tap,
  pause it, and unmute it only when its clip begins. All seven clips and six changes then run
  on the first Start. The real player must unlock its second element the same way.
- Headless Chrome on the Mac (not WebKit): next clip ready in 61-305 ms, swap wait 33-51 ms.
- Sound, reported by the user 2026-11-11: good across the scene changes. No log was pasted, so
  the numbers behind it are not recorded: the iPhone's swap timings, whether a dissolve
  sounded both videos at once (`firstPausedBySecond`), and whether the Web Audio variant was
  run. Cut and fade, the two transitions that ship first, are covered by this result;
  dissolve gets its own check when it is built (M5).

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

## M3. Build pipeline (medium to large; flix, nas and flotilla repos)

The build runs on the NAS in a nightly window (decided 2026-11-11, [[reels-edit-by-reference]];
the k8s render worker and its namespace are dropped).

- [x] The encoder: Quick Sync (`h264_vaapi`) at QP 18, chosen by the user 2026-11-11 (M0
  results).
- [ ] Prove on the hardware path what the benchmark did not exercise: bars for sources that
  are not 16:9 (`pad_vaapi`, or pad in software before upload), a bitrate ceiling at the
  source's own rate (QP 18 exceeded it on a 4K source), the dominant frame rate, and the
  sources that are not H.264 (hardware decode may not cover them all).
- [ ] nas repo: a reels folder and a scratch folder on `/volume1`; how flix reads the built
  files (inside the existing read-only export if the folder sits under it, otherwise a
  second export). No cron line: the NAS crontab is lost on reboot or firmware update
  (`nas:docs/adm.md`), which is why flix orchestrates.
- [ ] flotilla repo: a `reel-builder` service in the stack (the render image, `/dev/dri`, the
  library read-only, the reels and scratch folders writable, `restart: unless-stopped` so
  Docker brings it back after a reboot, niced). The builder **asks
  flix** for work every minute with an unauthenticated API call to flix's load-balancer IP
  and port (no hosts entry in the container, no port opened on the NAS, no NAS credential in
  the cluster); flix answers "nothing" outside the rules below.
- [ ] flix owns the schedule (`apps/server/src/reelBuilds.ts`, pure and tested): a reel
  marked "Build now" is offered at any hour. Otherwise work is offered only between 02:00 and
  05:00 `America/New_York` (computed with the zone, the pod's clock is UTC), one build at a
  time, the next no sooner than 5 minutes after the last one ended. Nothing is stopped: a
  build claimed before 05:00 runs to its end.
- [ ] `apps/render/`: a small image (ffmpeg + a Node script) that takes a plan, probes each
  source, renders each clip and each transition to an intermediate keyed by a content hash
  (fit to 1080p with bars, dominant frame rate, loudness, quality-targeted bitrate with both
  ceilings), joins by copy, writes sprites, reports progress. Pure parts tested: the ffmpeg
  argument builder, bar geometry, the bitrate ceiling, the intermediate key.
- [ ] Migration: `reel_builds`. `apps/server/src/reelBuilds.ts` and routes: the queue as an API
  the runner calls (claim the next build with its plan, report progress, finish or fail with
  a reason), one claim at a time, a claim that stops reporting returns to the queue, stale
  detection by plan hash.
- [ ] Media proxy: signed playback of a built reel from the reels mount ([[media-proxy]]).
- **Exit**: two queued reels build in one night with the pause between them, a killed build
  resumes the next night, and the result plays on the TV.

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
