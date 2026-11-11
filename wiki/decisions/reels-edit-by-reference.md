---
title: Reels are edited by reference, built on request and reviewed before listing
kind: decision
summary: The agreed plan for reels: clip ranges stored in Postgres, live preview from the originals, a queued build to one 1080p H.264 file on a dedicated worker, user approval before listing; not built yet.
tags: [reels, player, architecture, k8s, planning]
status: current
decided: 2026-11-10
by: user
verified: 2026-11-10
updated: 2026-11-10
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
- **Build**: a separate Kubernetes job on a dedicated worker (8 vCPU, 8 GB, low host priority,
  shrinks when idle through ballooning; no power control from flix), created only for a queued
  reel. Overnight by default (01:00 to 06:00), "Build now" per reel. Each clip and each
  transition renders to its own intermediate, so a build resumes and an edit rebuilds only
  what changed. Output goes to a new folder only the job can write; the library stays read-only.
- **Skipped**: the AirPlay receiver test. The first real reel is the test.

## Consequences

- New infrastructure in the nas repo (a writable export) and the k8s repo (the worker, the job's
  permissions). flix needs permission to create jobs in its namespace.
- Estimates, not measurements: about real time for a 1080p build on 8 vCPUs; 1 to 2.5 GB per
  20 minutes.
- Phase 0 before any build work: an encode benchmark on a worker and a two-clip playback spike
  on the iPhone (cut, fade, dissolve). Then: reels in the app, a compatibility badge, the build
  pipeline, review and listing, refinement ([[roadmap]]).
- Facts it rests on: the codec census in [[stash-library]] (91% H.264 in MP4, 25% 4K); the
  cluster is six VMs of 2 to 3 vCPUs on one 12-thread host with no GPU.
