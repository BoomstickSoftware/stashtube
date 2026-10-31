---
title: Media proxy
kind: architecture
summary: The browser never talks to Stash or sees its API key; /media/stash proxies an allowlist of Stash asset and stream paths, /media/play serves originals by byte range, and playback links are signed for AirPlay.
tags: [media, proxy, stash, security, airplay]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [apps/server/src/media.ts, apps/server/src/files.ts, apps/server/src/signing.ts, apps/web/src/lib/media.ts]
related: [player, caching, stash-api, nfs-media, config-env]
---

# Media proxy

**Rule 1: the browser never talks to Stash and never sees the API key.** Every Stash URL in
the web app goes through `mediaUrl()` (`apps/web/src/lib/media.ts`) → `/media/stash/...`.

## `/media/stash/*`

- Allowlist: paths matching `^/(scene|performer|studio|tag|group)/` (`ALLOWED` in `media.ts`);
  anything else is refused.
- Adds the `ApiKey` header, rewrites HLS playlists: Stash lists segments by root-relative path
  (`/scene/<id>/stream.m3u8/<n>.ts`), which the proxy turns into `/media/stash/...` again.
- Screenshots, previews, sprites, VTTs and entity images are served through the disk asset
  cache ([[caching]]); `/scene/<id>/stream*` (direct and HLS) is never cached.
- **`?w=320|640|960`** (`IMAGE_WIDTHS` in `@flix/shared`) asks for a smaller copy of an image:
  made once from the cached original with sharp, WebP quality 72, cached under its own key;
  never sent to Stash. Anything sharp cannot shrink (SVG, not an image, a broken file) and any
  other width get the original. The web asks through `sized(url, w)` and `srcSet(url)` with
  `sizes` (`CARD_SIZES` for the grids). A 1920 px screenshot of 382 KB comes to 29 KB at 640
  and 62 KB at 960; a performer image of 149 KB to 8 KB at 320 (2026-10-31).

## `/media/play/:id`

The original file with byte ranges (`files.ts`), read from the NFS mount when `MEDIA_PATH_MAP`
maps Stash's path onto a local one ([[nfs-media]]); otherwise it falls back to Stash's direct
stream. The client chooses direct vs HLS with `canPlayType` ([[player]]).

## Signed links and CORS

AirPlay receivers fetch the video URL themselves, with no session cookie, so a scene's
playback URLs carry `st=<expiry>.<hmac>` (`signing.ts`: HMAC-SHA256 of
`media:scene:<id>:<exp>` under `FLIX_SESSION_SECRET`, 24 h, valid for that scene's direct file,
HLS playlist and segments only). Without a password the key is a fixed string and links are
not checked. Links are absolute to `MEDIA_ORIGIN` when set (the LAN IP, because receivers
cannot resolve `flix.lan`); the BFF answers CORS on those paths only, since the page may be
on `flix.lan` while media comes from the IP ([[kubernetes-deployment]]). It echoes the asking
origin only when that is a local one; _until 2026-10-31_ it was `*` ([[request-guard]]).
