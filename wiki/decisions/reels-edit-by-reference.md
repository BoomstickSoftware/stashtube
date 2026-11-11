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
  33 times faster than x264 on two cluster CPUs). A cron job on the NAS starts at **02:00 US
  Eastern**, asks flix whether anything is queued, and builds **one reel at a time with a
  5-minute pause between builds**. It ends when the queue is empty or at **06:00**, whichever
  comes first. Each clip and each transition renders to its own intermediate, so a build
  resumes and an edit rebuilds only what changed. Output goes to a new folder; the library
  stays read-only to the build. _Was, until 2026-11-11: a Kubernetes job on a dedicated
  8-vCPU worker, 01:00 to 06:00, with "Build now" per reel._
- **Skipped**: the AirPlay receiver test. The first real reel is the test.

## Consequences

- New infrastructure is on the NAS only (the cron line, the build runner, a reels folder);
  the k8s worker, its namespace and the job permissions are no longer needed. flix exposes
  the queue over its API and reads the built files.
- Open after the move (the user's to settle): whether "Build now" remains; whether the
  hardware encoder's picture is good enough or the build uses software x264 on the NAS
  (as slow as the cluster was); what happens to a build still running at 06:00.
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
