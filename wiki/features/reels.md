---
title: Reels
kind: feature
summary: Mark ranges of videos, order them into a reel and preview it from the original files with cuts and fades; behind FLIX_REELS=1; the built file, review and listing are not built yet.
tags: [reels, player, editor]
status: current
verified: 2026-11-11
updated: 2026-11-11
routes: [/reels, /reel/$id]
api: [GET /api/reels, POST /api/reels, GET /api/reels/:id, PUT /api/reels/:id, DELETE /api/reels/:id, POST /api/reels/:id/clips, PUT /api/reels/:id/clips/order, PUT /api/reels/:id/clips/:clipId, DELETE /api/reels/:id/clips/:clipId]
code: [packages/shared/src/reels.ts, apps/server/src/reels.ts, apps/server/src/routes/reels.ts, apps/web/src/components/ReelPlayer.tsx, apps/web/src/components/ClipSheet.tsx, apps/web/src/pages/Reels.tsx, apps/web/src/lib/api/reels.ts, apps/web/src/lib/reels.ts]
related: [reels-edit-by-reference, reels-engineering-roadmap, player, data-model, ui-system]
---

# Reels

The design and its reasons: [[reels-edit-by-reference]]. What is left to build:
[[reels-engineering-roadmap]]. This page is what exists (milestone 1).

## Switch

`FLIX_REELS=1` on the server. Without it `/api/reels…` answers 404, `features.reels` is false,
and the web app shows no Clip button and no Reels link. Production has it off until the user
has tried it.

## What the user does

- **Mark a clip**: on a video's page, **Clip** opens a sheet with In and Out. They start at the
  playing moment and 15 seconds later; "Set to now" moves an edge to where playback is, the
  steppers move it by 0.1, 1 or 5 seconds, and the picture seeks along. Pick a reel (the last
  one used is offered first) or name a new one, **Add clip**.
- **Reels** is a section of the Browse strip: the list, **New reel**.
- **A reel's page** has the preview on top and the clips below. Per clip: tap to go there, move
  earlier or later, trim, remove (with Undo). Between two clips: Cut or Fade for that join;
  "Between clips" sets the reel's default. The "⋯" menu renames or deletes the reel (Undo).
- **Trim** shows the frames at In and Out from the sprite sheet (the nearest of about 80
  frames, a guide) and the same steppers; "Save and play start" or "Save and play end" (its
  last 3 seconds) shows the exact edge in the preview.

## How it works

- **Data**: `reels` and `reel_items` ([[data-model]]). A clip is a scene id, a start and an end
  in seconds, a position and an optional transition into the next clip. No video file is
  touched and Stash is not written.
- **One timeline function**: `planReel` in `packages/shared/src/reels.ts` turns the clips into
  segments on the reel's clock; `locate` and `reelTime` convert between reel time and a clip's
  video time; `fadeLevel` gives the picture level at a moment. The build (M3) will follow the
  same functions. A fade goes through black: the last `FADE_SEC` (0.3 s) of one clip fade out,
  the first 0.3 s of the next fade in; nothing overlaps, so a reel is as long as its clips.
- **Source check**: a clip remembers its video's length when it was marked. Read time compares
  it with the video now: another length (more than 0.5 s) marks the clip **shifted** (it still
  plays, with a warning to check it), a video that left the library marks it **missing** (it is
  skipped). Re-trimming a shifted clip accepts the new length.
- **Preview** (`ReelPlayer`): two video elements. One shows the current clip, the other holds
  the next one parked at its start, so a join is a swap. On the first Play tap the waiting
  element is started **muted** and paused again: without that iOS will not start it later,
  and started with sound it pauses the first video (the M0 spike). Each clip plays the original
  file when the browser can, else Stash's transcode. Measured in headless Chrome on a
  five-clip reel: every join within 0.1 s of its time.
- The reel object the page passes is new on every render; the player compares its content
  (`shape`), not its identity. _Until that fix a re-render at a join made the player reload the
  clip it had just left._

## Limits today

- No fullscreen in the preview (two elements cannot enter iOS's native fullscreen as one).
- Volume does not fade on an iPhone (a page cannot set a video's volume there); the picture does.
- Plays, resume and rating of reels are not recorded (M4). Dissolve is not offered (M5).
- Verified with stubbed reel data over the live library and against the dev database; adding a
  clip and reading a reel through Stash have not run end to end, because production has the
  switch off and this machine has no local Stash key.
