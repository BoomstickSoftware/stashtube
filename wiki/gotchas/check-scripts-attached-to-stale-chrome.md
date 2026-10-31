---
title: The check scripts attached to a stale Chrome on port 9333
kind: gotcha
summary: Until 2026-10-29 the headless check scripts used a fixed debugging port (9333) and silently attached to any Chrome already there, so runs drove a stale page; they now start their own Chrome on a free port.
tags: [dev, testing, chrome, mobile]
symptom: "Check script reports old behaviour or old screenshots after a code change"
found: 2026-10-29
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [scripts/mobile-check.mjs, scripts/touch-check.mjs, scripts/card-check.mjs]
related: [mobile-checks, port-5173-taken]
---

# The check scripts attached to a stale Chrome on port 9333

## Symptom

A mobile, touch or card check reported the old behaviour (or an old screenshot) after a
change that should have shown up, and the run finished suspiciously fast.

## Cause

The scripts launched Chrome with `--remote-debugging-port=9333` and connected to that port.
If a Chrome from an earlier run (or any other tool) still listened there, the connection went
to it and its already-loaded page, not to a fresh instance.

## Fix

Since 2026-10-29 the scripts pass `--remote-debugging-port=0`, read the port Chrome picks
from its output, and so always drive the Chrome they started.

## Avoid

Never hard-code a debugging port in a new check script. Runbook: [[mobile-checks]].
