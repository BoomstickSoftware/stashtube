---
title: "2026-10-31: StashDB covers through the proxy, shelf below the library, header skeletons"
kind: history
summary: StashDB covers proxied and resized by /media/remote, the wanted shelf moved below the library and collapsed to its count, entity headers as skeletons over a grid that fetches at once.
tags: [whisparr, stashdb, media, performers, studios, tags, ui, performance]
status: record
date: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
related: [media-proxy, whisparr-shelf, people-pages, library-before-wanted-shelf, categories-and-us-spelling, 2026-10-31-ux-audit]
---

# 2026-10-31: StashDB covers through the proxy, shelf below the library, header skeletons

Server report F3, client report F4–F6 and phone findings 3 and 11 of [[2026-10-31-ux-audit]].

## What changed

- **`/media/remote/<token>`** ([[media-proxy]]): `apps/server/src/remote.ts` (new) holds the
  allowlist (`stashdb.org` and subdomains, https only), `remoteImageUrl()` for the mappers,
  `remoteUpstream()` for the route and a redirect-bounded `fetchRemote()`. `signing.ts` gained
  `signRemote`/`verifyRemote` (`<base64url(url)>.<hmac>`, no expiry). `media.ts` serves the
  token through the existing `AssetCache` (`upstream` dispatches `https://` keys to
  `fetchRemote`), with `?w=` resizing, the own-ETag 304 rule and a 7-day `Cache-Control`.
  `toWanted` and `toRemote` return the proxied URL and drop covers on any other host.
  `@flix/shared`'s `sized`/`srcSet` accept `/media/remote/` as well as `/media/stash/`;
  `WantedCard` uses `srcSet`/`sizes`/`loading="lazy"`. Rule 1 of `CLAUDE.md` now names the
  covers.
- **Shelf below the library, collapsed** ([[whisparr-shelf]], [[library-before-wanted-shelf]]):
  `Performer.tsx` and `Studio.tsx` render `SceneBrowser` then `WantedShelf`; the shelf is a
  heading button "Not in your library yet · N+ on StashDB" (`aria-expanded`), open/closed in
  `flix.wanted.open`, Row/Grid and the hint kept inside. Page 1 is fetched for the count; no
  cover renders while closed.
- **Header skeletons** ([[people-pages]]): `HeaderSkeleton` in `EntityHeader.tsx` (performer
  hero, studio tile, tag eyebrow shapes); the three pages render it with the grid underneath
  from the first paint and keep `ErrorBox` for a failed record. The headers themselves moved
  into `PerformerHeader`/`StudioHeader`/`TagHeader` components in the same files.
- **"Category"** replaces the "#" eyebrow on the tag page ([[categories-and-us-spelling]]).

## How it was verified

`node scripts/check.mjs`: typecheck (server, shared, web), oxlint at the 5-warning baseline,
97 server tests (80 before). New tests: `remote.test.ts` (allowlist edge cases, forged token
for another host refused, redirect followed only within the allowlist, non-image → 404),
`media.test.ts` (unsigned/foreign tokens 404 without a fetch; a signed cover fetched once, then
304 on `If-None-Match`, `?w=320` → WebP never enlarged, an unknown width → the original) and
`signing.test.ts` (remote token round trip and malformed tokens). `pnpm --filter @flix/web
build` bundles. The server cannot run locally (no `.env`); one real cover was measured through
the server's sharp: 280,662 B → 7.6 / 19.3 / 33.4 KB at 320 / 640 / 960. The lead screenshots
after the merge.

## Snags

- `whisparr.test.ts` and `stashdb.test.ts` used `https://img/...` fixtures, which the allowlist
  now drops to `null`; they moved to `stashdb.org` URLs and assert the proxied form.
- The server tests leave an empty `apps/server/.cache-test` (the asset cache's directory);
  `.cache-test` was added to `.gitignore`.
- `WantedList` has no total that excludes what is already in the library (StashDB's `count`
  includes it), so the heading counts the loaded items with a "+".
