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

- One branch (`reels-m<n>-<topic>`, the first is `reels`; a branch named `reels/…` cannot exist beside `reels`), one pull request, **squash-merged**:
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
  for picture and sound, 2026-11-11: see M0 results; the page was removed 2026-11-11 and is
  in the branch history, commit `2a32218`): a throwaway page, two `<video>` elements,
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

Built 2026-11-11 on branch `reels-m1-app`; what exists is in [[reels]].

- [x] Migration `0013_reels`: `reels`, `reel_items`. No separate `clips` table: a clip exists
  only inside a reel (the Clip sheet picks or creates the reel as it saves).
- [x] `packages/shared/src/reels.ts`: types, `planReel`, `locate`, `reelTime`, `fadeLevel`,
  `clampClip`; tested in `apps/server/src/reels.test.ts`.
- [x] `apps/server/src/reels.ts` + `routes/reels.ts`: CRUD, reorder, validation, the source
  check. The check compares the video's length only, not a fingerprint.
- [x] Web: the Clip sheet on the video page (In and Out with steppers, not buttons inside the
  player's controls); the reel editor (order, transition per join and reel default, trim with
  sprite frames and steppers in place of a draggable filmstrip); `ReelPlayer` with two
  elements and the `planReel` timeline in the shared `SeekBar`.
- [ ] Still to do before the exit test: switch `FLIX_REELS=1` on in the k8s repo's flix
  deployment, then add a clip and open a reel against the live library (those two paths read
  Stash and have not run end to end).
- **Exit**: the user builds a reel of five clips from three videos on the phone and previews it
  with cuts and fades.

## M2. Compatibility badge (small, flix only)

Built 2026-11-11 on branch `reels-m2-badge`; what exists is in [[compatibility-badge]].

- [x] `packages/shared/src/compat.ts`: `compatibility(file)`, tested; `compat` on every card.
- [x] The badge on cards (only "Transcodes") and the video page; the Browse filter.
- **Exit**: the non-MP4 videos, and only those, read "transcodes". By counts against the live
  library: 258 of 2,985, matching the formats exactly. Seeing it in the app waits for the merge.

## M3. Build pipeline (medium to large; flix and flotilla repos, one folder on the NAS)

The build runs on the NAS in a nightly window (decided 2026-11-11, [[reels-edit-by-reference]];
the k8s render worker and its namespace are dropped).

Built 2026-11-11 on branch `reels-m3-build`; what exists is in [[reel-builds]], operating it
in [[run-the-reel-builder]].

- [x] The encoder: Quick Sync (`h264_vaapi`) at QP 18, chosen by the user 2026-11-11 (M0
  results).
- [x] The hardware path proven on the NAS for bars (`pad_vaapi`), fades (down to software and
  back), the reel's frame rate, and sources that are not H.264 (software decode): seven kinds
  of clip rendered and joined by copy.
- [x] NAS: `/volume1/Media/adult/reels` with `.work` inside it (made 2026-11-11). Stash does
  not scan it; flix reads it through its existing mount; no export, no k8s change.
- [x] The builder (`apps/server/src/reelBuilder.ts`, copied to the NAS by
  `scripts/reel-builder.mjs deploy`): asks flix every minute by IP, renders each clip to a
  hashed intermediate, joins by copy, reports progress, tidies up. No separate image: an
  `alpine:3.24` container that installs Node, ffmpeg and the driver at start.
- [x] flix owns the schedule: `nextBuild`, pure and tested (Build now at any hour; the window
  02:00 to 05:00 `America/New_York`; one at a time; 5 minutes between window builds).
- [x] Migration `0014_reel_builds`; the queue as an API (claim, progress, done, fail), a
  silent claim returned after 10 minutes, the reel marked changed by plan hash.
- [x] `/media/reel/<build>` serves the built file; the reel page's "Built file" panel.
- [ ] flotilla repo: the `reel-builder` service ([[run-the-reel-builder]], step 3).
- [ ] One build by hand on the NAS (`scripts/reel-builder.mjs once`): the builder has not run.
- [ ] Not built: sprites for the built file; a signed link for AirPlay behind a password.
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
