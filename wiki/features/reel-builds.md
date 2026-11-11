---
title: Reel builds
kind: feature
summary: A reel rendered to one 1080p H.264 file by a builder container on the NAS; flix holds the queue and decides when work is offered; the builder has not yet run end to end.
tags: [reels, nas, ffmpeg, queue, schedule]
status: current
verified: 2026-11-11
updated: 2026-11-11
routes: [/reel/$id]
api: [POST /api/reels/:id/build, DELETE /api/reels/:id/build, POST /api/reel-builds/claim, POST /api/reel-builds/:id/progress, POST /api/reel-builds/:id/done, POST /api/reel-builds/:id/fail, GET /api/reel-builds/files, GET /media/reel/:id]
code: [packages/shared/src/render.ts, apps/server/src/reelBuilds.ts, apps/server/src/reelBuilder.ts, apps/server/src/routes/reels.ts, apps/server/src/media.ts, apps/web/src/pages/Reels.tsx, scripts/reel-builder.mjs]
related: [reels, reels-edit-by-reference, reels-engineering-roadmap, run-the-reel-builder, media-proxy, data-model]
---

# Reel builds

Milestone 3 of [[reels-engineering-roadmap]]; the decisions are in [[reels-edit-by-reference]].
Behind `FLIX_REELS=1` like the rest of [[reels]]. Operating the builder: [[run-the-reel-builder]].

## For the user

The reel's page has a "Built file" panel: **Build tonight** or **Build now**; while queued, a
Cancel; while building, the step and a progress bar (the page asks again every 5 s); when done,
its length, size and age and **Play built file**, an ordinary video with the browser's own
controls, so AirPlay and fullscreen work. If the reel was edited since, the panel says so and
offers Rebuild. The old file keeps playing until the new one is done.

## Who decides what

- **flix owns the schedule** (`nextBuild` in `apps/server/src/reelBuilds.ts`, pure, tested):
  - a "Build now" reel is offered at any hour, ahead of the others;
  - otherwise the oldest queued reel is offered when the hour in `America/New_York` is 2, 3
    or 4 (the pod's clock is UTC; the zone handles daylight saving);
  - one build at a time; between window builds at least 5 minutes after the last one ended
    ("Build now" does not wait);
  - nothing is stopped at 05:00: a build claimed before then runs to its end.
- **The builder only asks.** A container on the NAS runs `apps/server/src/reelBuilder.ts`:
  every 60 s `POST /api/reel-builds/claim` to flix's IP, no login. 204 means nothing to do.
  It reports before each clip (the report is also its sign of life), then done or failed.
  A claim silent for 10 minutes goes back to the queue.
- Not a NAS cron job: the NAS crontab is lost on reboot. Docker restarts the container.

## What is rendered

Queueing snapshots the reel into a **build plan** (`reel_builds.plan`): per playable clip the
file's path as Stash names it, the range, the picture size, codec, bitrate, and whether it
fades in or out; plus the reel's frame rate (the rate most of its running time has, as 24, 30
or 60). The plan's hash is kept: another hash at read time is what "the reel changed" means.

Per clip (`clipArgs` in `packages/shared/src/render.ts`), all to 1920x1080 H.264 High, AAC
192k stereo 48 kHz, the same timescale, so the files join by copy:

| Source | Path |
|---|---|
| H.264 or HEVC | hardware decode, `scale_vaapi`, `pad_vaapi` for bars, encode `h264_vaapi` at QP 18 |
| anything else (VC-1, MPEG-4, AV1) | software decode, `scale`, `pad`, then upload and the same encode |
| a fade | frames come down (`hwdownload`), `fade`, back up as `nv12` |
| no sound track | silence, so every clip has the same streams |

Sound is levelled per clip (`loudnorm`) and padded to the picture's length. A clip that comes
out more than 10% above its source's bitrate is rendered again capped at the source's rate.
Each intermediate is named by a hash of source, range, fades, settings and the source file's
size and time, in `reels/.work`: a rebuild after an edit renders only the clips that changed,
and a killed build resumes from the clips it finished.

Output: `/volume1/Media/adult/reels/reel-<reel>-b<build>.mp4`, index first. flix reads it at
`/media/adult/reels` through its existing read-only mount (`FLIX_REELS_DIR`, default
`/data/adult/reels`, mapped by `MEDIA_PATH_MAP`) and serves it at `/media/reel/<build>` with
byte ranges. Stash does not scan that folder (its libraries are `adult/movies` and
`adult/scenes`). When a build finishes, the reel's earlier build rows go, and the builder
deletes built files no reel owns, half-written files, and intermediates unused for 30 days.

## Measured on the NAS (2026-11-11)

Seven 6-second clips through `clipArgs` in the Stash container, then joined by copy: 16:9
H.264, 4:3 (bars left and right), 4096x2160 (bars above and below), 60 fps VC-1 in WMV,
640x360 MPEG-4 in AVI, HEVC in Matroska, AV1. All seven came out 1920x1080 at 30 fps with
identical stream parameters and joined into one 42.0 s file. Each took 1.1 to 3.9 s (1.5 to
5.5 times real time) with fades and loudness levelling. The join logs "Non-monotonic DTS" on
the sound at each seam (a few milliseconds of AAC priming); the result's length is right.

## Not verified

- **The builder has never run.** A session may not start its container (it installs Alpine
  packages at start); `node scripts/reel-builder.mjs once <flix-url>` is the user's to run.
  The claim, report, done and file-serving paths have run only as far as the dev database.
- The capped second pass, a killed build resuming, tidy-up, and the built file on the TV.
- `/media/reel/<id>` has no signed link: with a flix password set, AirPlay could not fetch it
  (production has no password).
