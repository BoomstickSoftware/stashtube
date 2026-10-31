---
title: An unblocked headless run recorded plays in the real Stash
kind: gotcha
summary: A check run without request blocking wrote plays to the real Stash and the reset was refused by the permission classifier; every check script now blocks plays, activity, deletes, get, marker, O and rating writes.
tags: [testing, stash, privacy, dev]
symptom: "Play counts or resume points changed on videos nobody watched"
found: 2026-10-27
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [scripts/mobile-check.mjs, scripts/touch-check.mjs, scripts/card-check.mjs]
related: [mobile-checks, prod-checks-read-only, stash-owns-activity]
---

# An unblocked headless run recorded plays in the real Stash

## Symptom

After a headless player check, scenes showed plays and resume points that nobody had
watched. Stash's history, not flix's, had changed ([[stash-owns-activity]]).

## Cause

The player's watch accounting fires after 20 s of playback and every 15 s; a headless run
that plays a video is a viewer like any other. The first scripts intercepted nothing.
Undoing it would have meant `DELETE /api/history/<id>` against production data, which the
session's permission classifier refused.

## Fix

The check scripts intercept and log every write that records viewing or changes the
library: play and activity saves, deletes, both Whisparr `get` routes, marker, O-counter and
rating writes. A gesture test proves the attempt from the log without touching Stash.

## Avoid

Never run a browser against production without blocking writes
([[prod-checks-read-only]]). Add any new write route to the block list in all three scripts
the day it lands. Runbook: [[mobile-checks]].
