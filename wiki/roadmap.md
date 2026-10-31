---
title: Roadmap
kind: hub
summary: Where flix stands, what is left on the backlog, what is deferred, the known gaps and the open questions; done work is linked to its history page rather than listed.
tags: [roadmap, backlog]
status: current
verified: 2026-10-30
updated: 2026-10-31
related: [overview, log, 2026-10-31-ux-audit]
---

# Roadmap

## Status

flix is deployed and in daily use at http://flix.lan (192.168.1.152) since 2026-10-26, on the
k8s cluster with Stash as the headless backend on the NAS ([[stash-stays-headless]],
[[kubernetes-deployment]]). The Stash UI is the admin console only (scans, Identify,
settings). Every push to `main` goes live ([[deploy-and-verify]]).

Done, by date (each page says what changed and how it was verified):

- [[2026-10-26-spike-and-mvp]], [[2026-10-26-caching-and-ux-round-1]], [[2026-10-26-deployed-to-k8s]]
- [[2026-10-27-mobile-and-speed-round]]
- [[2026-10-28-round-2]]
- [[2026-10-29-round-3]], [[2026-10-29-round-4-review]], [[2026-10-29-typed-stash-layer-and-tag-outage]]
- [[2026-10-30-featured-ranking]], [[2026-10-30-markers-previews-api-split]],
  [[2026-10-30-whisparr-and-stashdb]], [[2026-10-30-duplicates-workbench]],
  [[2026-10-30-privacy-layers]], [[2026-10-30-mini-player]],
  [[2026-10-30-hold-to-mark-and-moments]], [[2026-10-30-wiki-created]],
  [[2026-10-30-relative-scrubbing]], [[2026-10-30-app-follows-deploys]]
- [[2026-10-31-review-round]], [[2026-10-31-home-speed-and-stations]], [[2026-10-31-scripts-library]],
  [[2026-10-31-shelf-grid-view]], [[2026-10-31-mini-player-expand]],
  [[2026-10-31-covers-shelf-skeletons]]

The brainstormed backlog of 2026-10-26 is exhausted except for the item below.

## UX audit roadmap (2026-10-31)

Five auditor agents measured and walked the live app ([[2026-10-31-ux-audit]]; raw reports in
`docs/audits/2026-10-31-ux/`). The plan below is ordered by what the user feels most, each
phase small enough to be one or two initiatives ([[one-commit-per-initiative]]). "F-numbers"
point into the reports. Targets are measurable with [[perf-checks]] and [[mobile-checks]].

**Targets**: Filters and Categories open in under 100 ms after any amount of browsing; a
performer page costs under 300 KB on the phone; no long task on an idle Home; CLS 0 on Home
and entity pages; a Browse page append under 30 ms at 800 cards; every failed write shows a
message; every control on the phone at least 44 px; one word per concept.

### Phase 0: quick wins (one initiative, S each)

_Phone, desktop and client items shipped 2026-10-31 ([[2026-10-31-ux-phase0-web]]); server and
freshness items in their own initiatives the same day._

- Phone: collapse the desktop nav below `lg` so landscape keeps the phone header
  (`Layout.tsx`); portal the Pin popover to a bottom sheet on touch (`SceneBrowser.tsx`);
  `touch:` padding on icon buttons, chips, stars, the sort label; 44 px hit areas for the
  title pencil and search Clear; show the shelf hint and Row/Grid labels on phones
  (`WantedRow.tsx`); hide Keyboard and Panic key sections under `touch:hidden`; gate the
  "hold to mark" hint on playback having started and drop the duplicate sentence in Moments.
- Desktop: `scroll-pl-4 sm:scroll-pl-6` on the three snap scrollers (Row, WantedRow,
  FeaturedDials); `aria-label` on thumbnail and studio links and the big play button;
  `group-focus-within:opacity-100` on hover-only card buttons; focus ring on the sort control;
  `toLocaleString()` in the entity headers; one wrapper width for Continue / History / Stats;
  `bg-surface` behind studio logos; `self-start` on the shortcut `kbd`s; "Clear filters" in
  the empty state; a real 404 with a Home link; `omitPerformer` on performer pages.
- Server: soften rating / O / edit / performer-favourite to `mutate([scene:<id>], expire
  ['scene'])` like plays (`stash.ts` F4, see decisions below); un-VOLATILE the StashDB pages
  and raise `maxVolatile` to 60 as a stopgap (F1); `LIST_TTL` 15 min (F2b); debounce the
  re-warm after a Stash change (F5); ETag for resized and generated assets (F8).
- Client: `poster={sized(scene.screenshot, 960)}` (F7); `React.memo(SceneCard)` with stable
  `select`/`toggle` props and a memoised flattened list (F1); hero index state inside `Hero`
  and `React.memo(Row)` (F2); a `sizes` prop on `SceneCard` for rows and tag tiles (F3, F9);
  `HOVER_DELAY` 500 ms, VTT after the delay, `preload="metadata"` on previews (F8).
- Freshness: global `mutations.onError` toast in `client.ts` (IA F1); station mutations also
  invalidate `station-previews` and `station-resume` (F8); ~~`performerGender` invalidates like
  `people` (F7)~~ dropped 2026-10-31: the owner wants the Women/Men/Everyone switch to affect
  only the Performers page, so the setting is to be decoupled from Home, Stats and search in
  its own initiative instead; remove-from-history invalidates `['scene', id]`; title/tag edits invalidate
  `['home']` and `['related']`; `deletePlaylist` deletes its `pl:<id>` resume row (F4); Block
  gets the Undo toast Hide has (F11); "Hidden" pressed label → "Not interested ✓" (F13).

### Phase 1: the cold paths (server caching, M)

- Per-family VOLATILE caps or a PINNED tag for the Whisparr list, the unfiltered facets and
  tiles working sets and `sceneStashIdMap` (F1); cache the computed facets and tiles under
  non-volatile, snapshotted keys so a deploy no longer costs 1–2 s on Filters (F6).
- The Whisparr list: store a 15-field projection, not the 41 MB array; patch it after a Get
  instead of dropping it; check whether Whisparr v3 can filter `/movie` by performer or studio
  (nas repo, `arr.py`) (F2).
- ~~StashDB covers through the media proxy (server F3, client F5)~~ done:
  [[2026-10-31-covers-shelf-skeletons]].
- Cache the finished `HomeRow[]` per visit seed (F7); `hono/etag` on `/api/*` so background
  refetches become 304s (client F10); drop `performers[].image` from `SCENE_CARD` (F9).

### Phase 2: rendering and layout stability (client, M)

- `content-visibility: auto` on cards and rows, or virtualise the grid, so append cost stops
  growing (F1); render Home rows below the fold lazily, or 12 cards per row with "See all"
  (F2, a product choice); Tags page tiles in chunks on a sentinel with tile-sized `sizes` (F3).
- No layout shift: ship station resumes in the home payload or reserve the row's height (F4,
  Home part); ~~the wanted shelf below the grid (F4); entity header skeletons with the grid
  fetching in parallel instead of a spinner (F6, phone 11)~~ done:
  [[2026-10-31-covers-shelf-skeletons]].
- `time`/`buffered` out of the Player's state into the SeekBar or an external store (F11).

### Phase 3: phone flows (M)

- One-row filter bar on phones: Filters · sort · "⋯" (Select, Pin, Station), count inline;
  Cleanup's chips likewise (phone 3).
- ~~The wanted shelf below the library, collapsed to its heading with the count (phone 3,
  desktop 1)~~ done: [[2026-10-31-covers-shelf-skeletons]].
- Card actions: one 44 px "⋯" on touch opening the long-press sheet; "Save to playlist…" in
  the sheet; Delete out of the sheet and out of the scene page's main row, into the details
  card (phone 4, 5).
- Player settings menu as a bottom sheet on touch (phone 9); sort control 44 px tall or into
  the Filters sheet; Watched/Rating/Quality above the tag cloud in Filters.
- Labels on touch: Discreet/Private first-use toast, "+" as "Filter" chips on the scene page,
  "2 filters" chip on Browse instead of a bare badge (phone 7); Browse density toggle 1/2
  columns (phone 10, taste); playlist rows without Move up/down on phones (phone 16);
  History remove with Undo (phone 17); a skeleton for the playlist header (performer, studio
  and tag headers have one: [[2026-10-31-covers-shelf-skeletons]]).

### Phase 4: desktop polish and accessibility (S–M)

- Settings: an `h1`, a sticky section list, Clean up moved to a "Library tools" group near
  Cache (desktop 11, IA F9); copy table in `desktop.md` §4 applied (device-neutral verbs, one
  spelling, "Save" vs "Saved", PIN placeholders, labelled panic URL field).
- Related sidebar capped with a "More like this" grid below, or sticky with its own scroll
  (desktop 10); "Pick up a station" below Featured or beside the hero at `xl` (13); About as
  a real button with inline facts and a deduped "Links (27)" disclosure (14).
- Right-click: add "Open in new tab" / "Copy link" or skip `preventDefault` with Shift (12);
  Shift+click range select and Cmd/Ctrl+A in select mode (24); NEW badge always visible at
  low opacity (18); `prefers-reduced-motion` for the hero, card zoom and previews (19); card
  meta contrast (21); station cover placeholders (26); tile skeletons for directories (27).

### Phase 5: vocabulary, freshness and errors (IA, S–M, several need a decision)

- One vocabulary: Follow / Following for everything derived from Stash's performer favourite
  ("Performers I follow" filter, "New from performers you follow" rows, the station quick
  start); Favorites for the video heart; Pin for tags; one spelling in the UI (IA F2,
  desktop 8); Categories or Tags everywhere (IA F12, desktop 8); "Playlist" instead of a
  third "Save"; "Save station" (IA F19).
- Optimistic rollbacks on error for rating, follow, pin and performer rating; Moments' Undo
  toast on success only (IA F1); progress and Continue badge patched after `saveActivity`
  (IA F3); Identify polled server-side until finished (IA F6); ~~Playlist Shuffle plays
  shuffled without rewriting the order (IA F5)~~ done in Phase 0; a "Requested" state on wanted cards between
  Get and the grab (IA row 18).
- Actionable errors: map "Stash: …" 502s to "Stash is busy or down (a scan locks it for a
  few minutes). Cached pages still work.", network failures to "No connection to flix"; client
  timeout below the server's so the server's reason wins (IA F15); an HLS error state in the
  player instead of an endless spinner (IA F16, verify with a renamed file); a dim "Your
  performer defaults" chip when Settings' people filter shortens a list (IA F18).
- Settings in five groups (Library, Feed, Playback, Privacy, Advanced) with an anchor strip,
  one page ([[settings-next-to-page]] kept) (IA F9); fix `CachePanel`'s "within 60 s" to
  mention the 10-minute idle gate; remove or wire `useWhisparrActivity`.

### Decisions the user owns (each becomes a `decisions/` page)

1. ~~Is one stale refresh of rating-sorted lists acceptable after rating, so ratings can
   `expire` instead of `invalidate` (server F4)?~~ Yes: [[ratings-expire-lists]] (2026-10-31).
2. ~~Does the wanted shelf lead a performer page, or follow the library / collapse to a heading~~
   Decided: library first, shelf collapsed below ([[library-before-wanted-shelf]]).
3. ~~"Categories" or "Tags"; US spelling~~ Decided: Categories, US spelling in the UI
   ([[categories-and-us-spelling]]).
4. ~~Playlist Shuffle: play shuffled only, never rewrite the stored order (IA F5)?~~ Decided
   2026-10-31: [[playlist-shuffle-plays-shuffled]].
5. ~~Ad hoc Station entry points~~ Decided: keep the list/entity "Station" chip, drop the
   card-sheet "Station from here" (Phase 3).
6. ~~Panic key on phones~~ Decided: desktop-only ([[panic-key-desktop-only]]).
7. ~~Library tools~~ Decided: a group in Settings ([[library-tools-group-in-settings]]).
8. ~~Gender switch~~ Decided: stays on the Performers page and affects nothing else
   ([[gender-switch-performers-page-only]]); an initiative decouples it.
9. ~~Home rows~~ Decided: keep 24, render lazily ([[home-rows-stay-24-render-lazily]]).
10. ~~A persistent "Stash is busy" pill~~ Decided: the toast only ([[failed-writes-toast-only]]).
11. A 480-px image variant for desktop grids (one more WebP per scene, ~50 MB) (client Q3)?
12. Browse on the phone: one column or two (phone 10)?

## Backlog

- **TPDB as a second stash-box endpoint in Stash**, optional: only if StashDB coverage gaps
  appear. Needs the user's TPDB API key; configured in Stash, then flix's [[stashdb]] layer
  would read a second endpoint. Chromecast was dropped ([[airplay-not-chromecast]]).

- **Scrubbing, to tune from use**: fine scrubbing (slower as the finger moves up from the
  bar) and the picture swipe in the station player ([[seek-bar-markers]]).


- **Open**: keep or drop the ad-hoc "Station" entry points (by Related, in the filter bar, on
  entity pages) now that only saved stations are remembered ([[stations-only-user-made]]).
- **Faster Home, what is left**: a cold feed is 1.0–1.2 s, most of it the Featured pool's
  0.8 s whole-library query (`tags { id favorite }` alone is 0.5 s of it); it is served stale
  after writes and kept across restarts, so a user rarely waits for it ([[featured-ranking]]).

## Later

- A hosted endpoint behind strong auth (Cloudflare Access or Tailscale Funnel with an identity
  provider), not just the app password. Today flix is LAN-only ([[lan-only-no-ingress]]).
- Decide whether to replace parts of Stash's backend behind the BFF; the web app only knows
  `@flix/shared` types so this stays possible ([[shared-contract]]).

## Known gaps

- A `navigate({ to: '.' })` reducer sees the union of every route's search type, so `prev` is
  cast in `StationEditor` ([[route-api-circular-types]]).
- The `hls.js` chunk is 574 kB; it loads only for transcoded videos (43 of 520 files on
  2026-10-26, [[player]]).
- Related videos are scored in the BFF from up to 120 candidates (same performers, studio,
  tags), not the whole library ([[related-videos]]).
- The CNPG backup mirror to the NAS has been OOMKilled since 2026-10-28 (base backup grew to
  ~1 GB when the Servarr databases moved into CNPG); flix's `flix` database is covered by the
  cluster's own backups and WAL archive meanwhile. The fix (a memory bump) is owned by the
  k8s repo ([[postgres-cnpg]]).

## Open questions

- The twelve decisions listed under the UX audit roadmap above ([[2026-10-31-ux-audit]]).

- Why do the mini-player's restore controls do nothing on the iPhone when play/pause and Stop
  beside them work, and both headless Chrome and real WebKit restore fine? Next evidence: the
  phone's Settings → Diagnostics copy after a tap on Expand ([[mini-player]], [[diagnostics]]).

- Does Whisparr's daily `RefreshStudios` still add newly released scenes to a studio whose
  new-items flag is off? Baseline for a later diff: 9,363 scenes across 36 studios at
  2026-10-30 17:00 UTC ([[whisparr-nothing-monitored]], [[whisparr-api]]).
- The duplicates workbench has never seen a real group: the library had none at any distance
  on 2026-10-30 ([[duplicates-workbench]]).
