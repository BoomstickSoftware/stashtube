---
title: Installable app
kind: feature
summary: What "Add to Home Screen" gives flix (standalone, no address bar, a Back button), how a deploy reaches the installed app, and where the manifest, meta tags and icons live.
tags: [pwa, ios, mobile, ui]
status: current
verified: 2026-10-30
updated: 2026-11-10
code: [apps/web/public/manifest.json, apps/web/index.html, apps/web/src/components/Layout.tsx, apps/server/src/index.ts, apps/web/src/lib/update.ts]
related: [player, mobile-first-ui, safari-address-bar-needs-page-scroll, private-session]
---

# Installable app

flix is installable from Safari's "Add to Home Screen" (and Chrome's install prompt).

## Behaviour

- `public/manifest.json`: `display: standalone`, `orientation: any`, dark background and
  theme colour, icons 192, 512 and a maskable 512. `index.html` carries the Apple meta tags
  (`apple-mobile-web-app-capable`, black-translucent status bar, title) and the touch icon.
- Installed, there is **no address bar**, so the Safari bar dance in the sideways player never
  happens ([[safari-address-bar-needs-page-scroll]]).
- Standalone has no browser Back, so the header shows one on phones below the top level
  (`display-mode: standalone` media query in `Layout`).
- Icons are rendered from `favicon.svg` with `qlmanage -t -s <px>` on the Mac.

## How a deploy reaches it

There is no service worker. iOS keeps a standalone app suspended in memory and resumes it from
the Home Screen without reloading, with no address bar and no pull to refresh, so flix reloads
itself (`lib/update.ts`, `keepCurrent()` in `main.tsx`):

- The server writes the build into the page (`<meta name="flix-version">`, the same commit as
  `/healthz`) and sends the page, the manifest and everything in `public/` as `no-cache`;
  only `/assets/*` (hashed names) is `immutable` for a year.
- **Back in the foreground** (`visibilitychange`), the app asks `/healthz` (no-store) and
  reloads when the server's build differs from its own, unless a video is playing; the next
  return checks again. The URL survives the reload, and so does a [[private-session]].
- **A missing chunk**: `/assets/<missing>` is a 404 (it used to be the SPA page, 200
  `text/html`, which failed uncatchably), Vite fires `vite:preloadError`, and the app reloads.
- **No loops**: localStorage `flix.reloads` keeps the last attempt's time and attempts per
  target build. At most 2 attempts per target (a rollout may serve the old page once), never
  within 30 s of the last, and no automatic reload when storage cannot be written. After the
  limits a missing chunk shows the route's error screen.
- The dev server's page carries no build, so nothing happens under `pnpm dev`.

Verified 2026-10-30 against a local server with fake builds (headers; one reload per new
build; a never-matching `/healthz` stops after 2; a removed route chunk reloads once, then
shows the error screen) → [[2026-10-30-app-follows-deploys]].

A full PWA (offline, service worker) is not done; see [[roadmap]].

## Getting a new build onto the phone

The installed app is resumed from memory, so it keeps the code it started with. `lib/update.ts`
reloads it on returning to the foreground when `/healthz` reports another build, but never while
a video plays. A pull to refresh checks too: with nothing playing it reloads at once; otherwise
a toast offers **Update now**. _Until 2026-11-10_ a pull only refetched data, so a phone kept in
the foreground with a video docked stayed on the old build through a whole test session.
