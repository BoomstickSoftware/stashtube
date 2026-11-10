---
title: A check script dies with "Cannot read properties of undefined (reading 'addEventListener')"
kind: gotcha
summary: A headless Chrome left behind by an earlier check script holds the shared profile, so the next script's Chrome never opens a debugging socket; kill the leftover and rerun.
tags: [dev, testing, chrome, mobile]
symptom: "TypeError: Cannot read properties of undefined (reading 'addEventListener') at the line that awaits the WebSocket's open"
found: 2026-11-10
status: current
verified: 2026-11-10
updated: 2026-11-10
code: [scripts/phone-flow.mjs, scripts/mini-check.mjs]
related: [mobile-checks, check-scripts-attached-to-stale-chrome]
---

# A check script dies reading 'addEventListener' of undefined

## Symptom

`phone-flow.mjs` or `mini-check.mjs` stops at once with `TypeError: Cannot read properties of
undefined (reading 'addEventListener')` on the line that waits for the DevTools socket. The run
before it ended early (a step failed) or was interrupted.

## Cause

That earlier run left its Chrome alive. The scripts share one profile directory
(`profile-neutral`), and a second Chrome on a profile in use hands over to the first and exits
without printing a debugging port, so there is no socket to open.

## Fix

```sh
pkill -f "user-data-dir=.*profile-neutral"    # only the check scripts' Chrome matches
```

Then rerun the script.

## Avoid

When a check script exits on an error, look for its Chrome before starting the next one
(`pgrep -fl profile-neutral`). Runbook: [[mobile-checks]].
