---
title: Compatibility badge
kind: feature
summary: Each video says where its file plays without a transcode (everywhere, some devices, transcodes), from its container and codecs; a "Transcodes" badge on cards, a line on the video page and a Browse filter.
tags: [player, browse, filters, transcode]
status: current
verified: 2026-11-11
updated: 2026-11-11
routes: [/browse, /scene/$id]
api: [GET /api/scenes?transcodes=1]
code: [packages/shared/src/compat.ts, apps/server/src/stash/mappers.ts, apps/server/src/stash/filters.ts, apps/web/src/components/SceneCard.tsx, apps/web/src/components/Filters.tsx, apps/web/src/pages/Scene.tsx]
related: [stash-library, browse-and-filters, player, reels-engineering-roadmap]
---

# Compatibility badge

Reels milestone 2 ([[reels-engineering-roadmap]]), useful on its own: which videos Stash has to
transcode for an iPhone, a Mac or AirPlay.

## The three answers

`compatibility({ container, videoCodec, audioCodec })` in `packages/shared/src/compat.ts`; the
server puts the answer on every card as `compat`.

| Answer | Rule | In the library on 2026-11-11 (2,985 videos) |
|---|---|---|
| `everywhere` | MP4, MOV or M4V with H.264 and AAC, MP3 or no sound | 2,727: every MP4 is H.264 with AAC |
| `device` | an MP4-family file with any other codec (HEVC, AV1, AC-3…) | 0 |
| `transcode` | any other container | 258: 122 AVI, 95 Matroska, 41 WMV |

The container is Stash's `format` (`mp4`, `matroska`, `avi`, `wmv`).

## Where it shows

- **Cards**: an amber "Transcodes" badge beside the resolution, only on videos that transcode
  (the other 91% carry no badge).
- **The video page**: "Plays everywhere", "Plays on some devices" or "Transcodes" in the facts
  line.
- **Browse → Filters → Playback**: "Only videos that are transcoded (not MP4)", the
  `transcodes` query flag, with its chip. Stash has no container filter, so the server asks
  for paths that do not end in `.mp4`, `.m4v` or `.mov` (`NOT_MATCHES_REGEX`); that query
  returned 258, the same videos the formats count gives.

## Verified

In production after the deploy (2026-11-11): `GET /api/scenes?transcodes=1` returns 258 of
2,991 videos, each with `compat: transcode`; a page of the default list is all `everywhere`.
The badge, the video page's line and the filter toggle have not been looked at on the phone.
