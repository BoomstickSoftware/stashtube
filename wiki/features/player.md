---
title: Player
kind: feature
summary: How the video player picks direct play or Stash's HLS transcode, what it records, its quality menu, resume pill, fullscreen and the touch controls.
tags: [player, playback, hls, touch, resume]
status: current
verified: 2026-10-31
updated: 2026-10-31
routes: [/scene/$id]
api: [GET /media/play/:id, GET /media/stash/scene/:id/stream.m3u8, POST /api/scenes/:id/play, POST /api/scenes/:id/activity]
code: [apps/web/src/components/Player.tsx, apps/web/src/lib/playback.ts, apps/web/src/lib/media.ts, apps/server/src/media.ts, apps/server/src/signing.ts]
related: [seek-bar-markers, moments, mini-player, mobile-first-ui, safari-address-bar-needs-page-scroll, keyboard-shortcuts, media-proxy, stash-api]
---

# Player

`components/Player.tsx` is the one video player; `lib/playback.ts` holds what it shares with
the station player: attaching a source (direct, or HLS through hls.js), the watch accounting,
the key guard, marker jumps and the flash label.

## Source

The client checks `canPlayType` for the file's container and codecs. If the browser can play
the file it streams the original, `/media/play/:id` (byte ranges; from the NFS mount when
`MEDIA_PATH_MAP` resolves it, else Stash's direct stream). Otherwise, and on any media error,
it uses Stash's HLS transcode (`stream.m3u8`, hls.js outside Safari) through the
[[media-proxy]]. Quality menu: **Auto** plays the original and drops to a 720p transcode after
3 stalls within 30 s ("Switched to 720p"); **Original** never drops; 1080/720/480/240
force Stash's transcode. Stored per browser as `flix.quality`.

## Accounting

A play counts after 20 s watched (`COUNT_PLAY_AFTER`); the time and resume point go to Stash
every 15 s (`SAVE_EVERY`), on pause, end, leaving the page and tab close. The resume point is 0
(none) before 30 s (`RESUME_AFTER`) and past 95% or the last 15 s (`FINISHED_AT`), so it only
marks videos really in progress ([[continue-history-stats]]). Nothing is sent in a
[[private-session]]. A saved resume point is applied automatically with a "Resumed at … · Start
over" pill for 8 s; Start over honours the studio's intro skip (Settings on the studio page,
`PUT /api/studios/:id/intro`, 0–600 s).

## Behaviour

- Videos open paused unless Settings › Playback says otherwise; Play buttons, Play all and up
  next pass `?play=1` and always start. Autoplay next (`flix.autoplay`), theater
  (`flix.theater`), volume (`flix.volume`), picture in picture (`i`), AirPlay through signed
  per-scene links that work without a login cookie (`signing.ts`, `MEDIA_ORIGIN`).
- Keys follow YouTube conventions, listed in [[keyboard-shortcuts]]; they unbind while the
  player is docked ([[mini-player]]).
- Markers draw on the seek bar ([[seek-bar-markers]]); a hold on the picture marks a moment
  ([[moments]]).

## On touch screens

- A tap shows or hides the controls and does not pause. A double tap on the left or right
  third seeks 10 s. With the controls up, the middle has −10 / play-pause / +10.
- A **sideways swipe on the picture scrubs**: once a finger has moved 10 px more sideways than
  up or down (`SWIPE_SLOP`), it drives the seek bar's relative drag (1:1 with the bar's width,
  preview while moving, seek on release) and brings the controls up; the centre buttons and the
  hold hint step aside while scrubbing. A vertical swipe is left to the page (it hides Safari's
  address bar). A swipe that starts on a centre button does not scrub.
- The seek bar itself: tall hit area, tap to jump, relative drag ([[seek-bar-markers]]);
  hidden controls take no taps. The controls' gradient never takes taps itself.
- Speed and "Mark this moment" live in the gear menu (no keyboard on a phone).
- Fullscreen: iPhone Safari can only make a bare `<video>` fullscreen, so flix calls
  `webkitEnterFullscreen` (system controls). Elsewhere the player element goes fullscreen, and on
  Android a landscape video locks the screen to landscape.
- A phone turned sideways (`landscape and pointer: coarse and max-height: 520px`) gets the
  player fixed over the whole screen with flix's own controls, padded for the safe areas, and
  `touch-pan-y` so a swipe up hides Safari's address bar ([[safari-address-bar-needs-page-scroll]]).
  Installed, there is no bar at all ([[installable-app]]).

The rules behind these are in [[mobile-first-ui]].

## Numbers

- 477 of 520 files were mp4/h264/aac and play direct; the other 43 (mkv hevc or h264-ac3, avi
  mpeg4, wmv vc1, av1) transcode (2026-10-26).
- The first HLS segment takes about 2.3 s (2026-10-26).
- The hls.js chunk is 574 kB and loads only for transcoded videos.
