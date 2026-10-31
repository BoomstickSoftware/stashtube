---
title: Diagnostics (the on-device log)
kind: feature
summary: Settings → Diagnostics keeps what a desktop console would show (errors, rejections, navigations, the player's dock state, taps on the mini-player) in memory, with Copy, for phone bugs no session can reproduce.
tags: [settings, mobile, debugging, player]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [apps/web/src/lib/diag.ts, apps/web/src/pages/Settings.tsx, apps/web/src/main.tsx, apps/web/src/lib/nowPlaying.ts, apps/web/src/components/NowPlaying.tsx]
related: [mini-player, mobile-first-ui, mobile-checks]
---

# Diagnostics (the on-device log)

A phone has no console. When the iPhone misbehaves in a way neither headless Chrome nor real
WebKit reproduces ([[mini-player]], 2026-10-31), the only evidence is on the device, so the
app keeps a little of what a console would show and lets the user copy it.

## What is recorded

`lib/diag.ts` holds the last 80 entries in memory (nothing is stored or sent):

- `start /path` when the app loads; `navigate → href` and `resolved href` from the router's
  `onBeforeNavigate` and `onResolved` events (`watch(router)` in `main.tsx`);
- `error: message (file:line)` from `window` `error` events and `rejected: Name: message`
  from `unhandledrejection`;
- `player: scene <id> on its page | docked` and `player: closed` from the now-playing store's
  state changes;
- `dock: tap Expand | title | picture` from the mini-player's restore links.

## Where it shows

Settings → Advanced → **Diagnostics**, below Cache ([[settings-page]]): a header line (build from the `flix-version` meta,
`installed app` or `browser tab` from `display-mode: standalone`, the user agent), then the
entries newest first with a time. **Copy** puts the header and the entries, oldest first, on
the clipboard (toast "Copied"); **Clear** empties the list.

## How to use it for a phone bug

Make the bug happen, open Settings, Copy, paste into the chat. The expected trace for a tap
on Expand that works is `dock: tap Expand`, `navigate → /scene/<id>`, `player: scene <id> on
its page`, `resolved /scene/<id>`. Which of those is missing says where it stops.
