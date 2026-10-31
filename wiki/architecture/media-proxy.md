---
title: Media proxy
kind: architecture
summary: The browser talks only to flix; /media/stash proxies allowlisted Stash paths, /media/remote fetches StashDB covers by signed token, /media/play serves originals by byte range, playback links are signed for AirPlay.
tags: [media, proxy, stash, stashdb, security, airplay]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [apps/server/src/media.ts, apps/server/src/remote.ts, apps/server/src/files.ts, apps/server/src/signing.ts, apps/server/src/media.test.ts, apps/server/src/remote.test.ts, apps/web/src/lib/media.ts]
related: [player, caching, stash-api, stashdb, whisparr-shelf, nfs-media, config-env]
---

# Media proxy

**Rule 1: the browser talks only to flix; it never talks to Stash, never sees the API key, and
(since 2026-10-31) never fetches a StashDB cover itself.** Every Stash URL in the web app goes
through `mediaUrl()` (`apps/web/src/lib/media.ts`) → `/media/stash/...`; every StashDB cover
the API hands out is already a `/media/remote/<token>` URL.

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
  `sizes` (`CARD_SIZES` for the grids); both helpers act on `/media/stash/` and `/media/remote/`
  URLs and leave anything else alone. A 1920 px screenshot of 382 KB comes to 29 KB at 640
  and 62 KB at 960; a performer image of 149 KB to 8 KB at 320 (2026-10-31).

## `/media/remote/<token>`

The covers of the "Not in your library yet" shelf ([[whisparr-shelf]]) live on stashdb.org
(StashDB's `images[].url`; Whisparr's `images[].remoteUrl` points at the same place). _Until
2026-10-31_ `WantedRow` hotlinked them full size: 24 × ~280 KB a page, no resize, no cache, the
browser leaving the LAN. Now:

- `remote.ts`: `remoteImageUrl(url)` is what `toWanted` (`whisparr.ts`) and `toRemote`
  (`stashdb.ts`) put in `WantedScene.image`: `/media/remote/<base64url(url)>.<hmac>` for an
  allowed URL, `null` for any other (dropped, never hotlinked). The HMAC (`signRemote` /
  `verifyRemote` in `signing.ts`, SHA-256 of `media:remote:<url>` under `FLIX_SESSION_SECRET`)
  has no expiry: a cover's URL is stable and the browser keeps the image a week.
- **Allowlist** `REMOTE_HOSTS = ['stashdb.org']` (and its subdomains), https only, no
  credentials in the URL: checked when the token is made and again when it is verified, because
  without a password the key is the fixed `flix-unsigned` and a token could be forged. The
  fetch follows at most 3 redirects, each hop re-checked, and treats a non-image as a 404.
- Served through the same `AssetCache` as Stash's assets (the cache key is the upstream URL;
  the `upstream` callback dispatches a `https://` path to `fetchRemote`, everything else to
  Stash), so `?w=` resizing, the own weak ETag → 304 rule and the LRU cap apply unchanged.
  `Cache-Control: private, max-age=604800` (7 days) like an unversioned Stash asset; the URL
  has no version stamp, so the copy is revalidated after `ASSET_CACHE_TTL_HOURS`.
- A token the server did not sign, or one for another host, is a 404 and nothing is fetched
  (`media.test.ts`, `remote.test.ts`, `signing.test.ts`).
- Numbers: the 1920×1080 JPEG cover `7e9a8bdb-…` is 280,662 bytes from stashdb.org (0.99 s
  from the Mac); at the proxy's settings it is 7.6 KB at 320, 19.3 KB at 640, 33.4 KB at 960
  (measured 2026-10-31 with the server's sharp). A 24-card shelf page is ~0.46 MB of covers at
  640 instead of 6.7 MB, and only the first visit costs StashDB anything.

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
