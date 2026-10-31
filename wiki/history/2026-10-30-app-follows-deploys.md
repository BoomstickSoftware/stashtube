---
title: "2026-10-30: The open app follows deploys"
kind: history
summary: The installed app now reloads itself onto a new build (on return to the foreground or a missing chunk), with the page revalidated, missing assets a 404 and hard limits against reload loops.
tags: [history, pwa, ios, deploy]
date: 2026-10-30
commits: [ee93c56]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [installable-app, deploy-and-verify]
---

# 2026-10-30: The open app follows deploys

## What changed

- Server: the page carries `<meta name="flix-version">`; the page and `public/` are `no-cache`;
  a missing `/assets/*` is a 404 instead of the SPA page.
- Web: `lib/update.ts` reloads on return to the foreground when `/healthz` reports another
  build (not while a video plays) and on `vite:preloadError`, at most 2 attempts per target,
  30 s apart, and never without writable storage → [[installable-app]].
- The user asked that it can never loop; the limits above are the answer.

## How it was verified

The built web app on a local server (`FLIX_VERSION` faked, Stash pointed nowhere, dev Postgres),
driven by headless Chrome over CDP: headers per path; build-a → build-b reloads once and stays;
a `/healthz` intercepted to answer build-z forever reloads twice, 30 s apart, then never; a
dispatched `vite:preloadError` reloads twice then lets the error through; unwritable storage
never reloads; a route chunk renamed away reloads once and then shows the error screen.
Typecheck, web `tsc -b`, lint (no new warnings), 69 tests, image build.

## Snags

- The first test run's steps were masked by the 30 s gap; each limit had to be tested with the
  previous attempt aged, or a pass proved the wrong limit.
- The local server cannot read `.env` from the sandbox; it ran with dummy Stash variables.
