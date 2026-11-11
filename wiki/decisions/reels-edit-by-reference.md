---
title: Reels are edited by reference, built on request and reviewed before listing
kind: decision
summary: The agreed plan for reels: clip ranges stored in Postgres, live preview from the originals, a queued build to one 1080p H.264 file on the NAS in a nightly window, user approval before listing; not built yet.
tags: [reels, player, architecture, nas, planning]
status: current
decided: 2026-11-10
by: user
verified: 2026-11-11
updated: 2026-11-11
related: [stations, player, data-model, stash-owns-activity, nfs-media, stash-library, roadmap]
---

# Reels are edited by reference, built on request and reviewed before listing

**Decided** 2026-11-10 by the user, over a plan reviewed in three revisions. **Status** current;
nothing is built. The illustrated plan is a private artifact titled "Reels Build Plan".

## Context

The user wants to mark ranges in videos and play them as one sequence across videos without
altering any file, and to AirPlay the result. AirPlay receivers fetch one URL themselves, so a
sequence stitched in the app cannot be cast: a real file is needed for that.

## Decision

- **A reel is a list of references** (scene id, start, end, transition into the next clip) in
  Postgres. That design is the truth; a built file is a cache of it.
- **Live preview** plays the design from the original files with two video elements. One shared
  plan function feeds both the preview and the build.
- **Gates**: nothing builds until the user queues it, nothing is listed until the user approves
  it. States: Draft, Queued, Building, Needs review, Published, Failed. Editing a published reel
  returns it to Draft while the published file keeps playing.
- **Review**: a "Ready for review" strip on Home; the page proposes performers, categories,
  studios, title and cover from the contributing scenes for the user to confirm.
- **Reels are not Stash scenes.** They carry their own confirmed performers and tags (by Stash
  id), cover, rating, resume point and plays in flix. Separate but equal: a Browse section,
  search, shelves on performer and category pages; not mixed into the Stash-paged video grids.
- **Output**: MP4, H.264, 1080p, stereo AAC, index first. 4K scaled down, smaller scaled up,
  bars where the shape is not 16:9 (never stretched or cropped), the reel's dominant frame rate,
  loudness levelled per clip, quality-targeted bitrate under a ceiling and never above what the
  source justifies. Every clip is re-encoded; the stream-copy path was dropped.
- **Transitions**: cut and fade through black ship first; dissolve later. The design stores a
  reel default and a per-join override from day one.
- **Build**: on the NAS (decided 2026-11-11, after the M0 benchmark: Quick Sync there is 14 to
  33 times faster than x264 on two cluster CPUs). **flix orchestrates**: a builder container on the NAS
  asks flix for work with a plain unauthenticated API call, to flix's **IP and port, not its
  hostname**. flix offers a **"Build now"** reel at any hour; otherwise it offers queued reels
  only from **02:00 US Eastern**, **one at a time with a 5-minute pause between builds**, and
  **stops offering new ones at 05:00**. A build in progress then finishes on its own; nothing
  is cut off. Not a NAS cron job: the NAS's
  crontab does not survive a reboot or firmware update without a restore step (the user,
  2026-11-11). The NAS only executes. Each clip and each transition renders to its own intermediate, so a build
  resumes and an edit rebuilds only what changed. Output goes to **`/volume1/Media/adult/reels`** (the user,
  2026-11-11: a subfolder of `adult`, so this content stays apart from the general-audience
  library); the rest of the library stays read-only to the build. _Was, until 2026-11-11: a Kubernetes job on a dedicated
  8-vCPU worker, 01:00 to 06:00. "Build now" per reel was kept._
- **Skipped**: the AirPlay receiver test. The first real reel is the test.

## Consequences

- New infrastructure is on the NAS only (a builder container in the flotilla stack, a reels
  folder);
  the k8s worker, its namespace and the job permissions are no longer needed. flix exposes
  the queue over its API and reads the built files.
- **Encoder** (decided 2026-11-11, by the user from a blind side-by-side of five settings on
  two sources): **Quick Sync (`h264_vaapi`) at constant QP 18**. A good speed-up that keeps
  the picture best; its files are 1.5 to 2 times the size of x264's at the same likeness,
  which the user accepted. The ceiling "never above what the source justifies" still
  applies: at QP 18 a 4K source came out above its own bitrate.
- Earlier estimates (about real time on 8 vCPUs) are replaced by the measurements below.
- Phase 0 before any build work: an encode benchmark on a worker and a two-clip playback spike
  on the iPhone (cut, fade, dissolve). Then: reels in the app, a compatibility badge, the build
  pipeline, review and listing, refinement ([[roadmap]]).
- Measured 2026-11-10 (the numbers and method are in [[reels-engineering-roadmap]], M0
  results): the planned settings encode at 6.6 to 7.1 fps on 2 CPUs, about a quarter of real
  time, from 1080p and 4K sources alike; on the iPhone the second video element must be
  unlocked muted. On the NAS, Quick Sync encodes at 3.9x (4K source) to 9.25x (1080p) real
  time; software x264 there at 0.28x.
- Facts it rests on: the codec census in [[stash-library]] (91% H.264 in MP4, 25% 4K); the
  cluster is six VMs of 2 to 3 vCPUs on one 12-thread host with no GPU.
