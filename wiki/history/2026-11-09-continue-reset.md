---
title: "2026-11-09: Continue reset (initiative B)"
kind: history
summary: Continue gets Select → Remove, a Remove item in the card menu and on the scene page, a 30-day expiry chosen above the list, and Mark as watched that also clears the resume point.
tags: [history, resume, continue, ui]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [continue-history-stats, continue-clears-and-expires, 2026-11-09-strategy-review]
---

# 2026-11-09: Continue reset (initiative B)

## What changed

- `POST /api/continue/clear`, `POST /api/scenes/:id/watched`, `settings.continueDays` (30) and
  the daily expiry in `continue.ts` ([[continue-history-stats]]).
- Continue: the expiry choice above the list; Remove first in the selection bar. The selection
  bar shows Favorite, Add to playlist and Delete as icons below `sm`, so it fits a phone with a
  page action added ([[browse-and-filters]]).
- Card menu: Remove from Continue; Mark as watched also on videos with a resume point. Scene
  page: Remove from Continue beside Identify ([[scene-page]]).

## How it was verified

`node scripts/check.mjs` (142 server tests, two new for the expiry cut-off); `phone-flow`
screenshots of /continue and its selection bar at iPhone size against production with the new
setting stubbed (writes blocked). After the deploy: `GET /api/settings` carries `continueDays`.

## Snags

- A resume point with no play on record counts from the video's `created_at`. On 2026-11-09,
  14 of the 79 had no play date, all added 2026-10-25 or later, so the first run cleared none;
  the oldest reach 30 days on 2026-11-24.
- The bulk bar wrapped its labels and pushed Delete off a 440 px screen once Remove was added;
  icons-only below `sm` fixed it.
