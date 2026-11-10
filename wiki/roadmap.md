---
title: Roadmap
kind: hub
summary: Where flix stands, what is left on the backlog, what is deferred, the known gaps and the open questions; done work is linked to its history page rather than listed.
tags: [roadmap, backlog]
status: current
verified: 2026-10-30
updated: 2026-11-10
related: [overview, log, 2026-10-31-ux-audit, 2026-11-09-strategy-review, 2026-11-10-architecture-and-ux-review]
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
  [[2026-10-31-ux-copy-settings-errors]], [[2026-10-31-ux-phase5-freshness]]
  [[2026-10-31-covers-shelf-skeletons]]
- [[2026-11-09-edu-section]], [[2026-11-09-unlisted-and-vault]], [[2026-11-09-discover-hides-vr]], [[2026-11-09-discover-toggles-and-details]], [[2026-11-09-cast-categories]], [[2026-11-09-cast-overrides]], [[2026-11-09-bulk-categories]], [[2026-11-09-studio-default-categories]]

The brainstormed backlog of 2026-10-26 is exhausted except for the item below.

## Strategy review roadmap (2026-11-09)

From [[2026-11-09-strategy-review]]. One initiative each ([[one-commit-per-initiative]]), in order.

- **A. Cache tags** (S): done, [[2026-11-09-cache-tags-round]].
- **B. Continue reset** (S–M): done, [[2026-11-09-continue-reset]] ([[continue-history-stats]]).
- **C. Background load** (S–M): done, [[2026-11-09-background-load]].
- **D. One "Hide" model** (M): done, [[2026-11-09-hide-model]] (decision
  [[hide-means-delete-block-or-unlist]]); the Hidden section stays in Settings until G.
- **E. Scene page "⋯" menu** (S): done, [[2026-11-09-scene-menu]].
- **F. History** (M): done, [[2026-11-09-history-rework]].
- **G. Navigation** (M–L): done, [[2026-11-09-navigation]] ([[navigation]]). The strategy roadmap is complete.

## UX audit roadmap (2026-10-31)

Five auditor agents measured and walked the live app ([[2026-10-31-ux-audit]]; raw reports in
`docs/audits/2026-10-31-ux/`). The plan below is ordered by what the user feels most, each
phase small enough to be one or two initiatives ([[one-commit-per-initiative]]). "F-numbers"
point into the reports. Targets are measurable with [[perf-checks]] and [[mobile-checks]].

**Targets**: Filters and Categories open in under 100 ms after any amount of browsing; a
performer page costs under 300 KB on the phone; no long task on an idle Home; CLS 0 on Home
and entity pages; a Browse page append under 30 ms at 800 cards; every failed write shows a
message; every control on the phone at least 44 px; one word per concept.

**Status 2026-10-31, end of day**: every phase shipped and is live (history pages:
[[2026-10-31-ux-phase0-web]], [[2026-10-31-hero-pages-the-ranking]],
[[2026-10-31-ux-phase1-server-caching]], [[2026-10-31-covers-shelf-skeletons]],
[[2026-10-31-ux-phase2-3-web]], [[2026-10-31-ux-copy-settings-errors]],
[[2026-10-31-ux-phase4-desktop-polish]], [[2026-10-31-ux-phase5-freshness]]). Targets met
and measured: Filters and Categories 7–9 ms right after a deploy, a phone performer page
254 KB, CLS 0.02 on Home and 0 on entity pages, every failed write toasts, 44 px controls,
one vocabulary. Priority from here: the phone first ([[iphone-first-polish]]). Not re-measured: the Browse append at 800 cards (cards now skip layout
off-screen). The iPhone mini-player bug is found and fixed (the next video opened docked
over its own page, [[next-video-opens-docked-over-its-own-page]]). Still open: History remove keeps its confirm and has
no Undo, since Stash cannot restore a removed play; the optional inline facts in the
performer header at `lg`; a History-list skeleton.

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

_Shipped 2026-10-31 ([[2026-10-31-ux-phase1-server-caching]], covers in
[[2026-10-31-covers-shelf-skeletons]]); the gender switch decoupling went with it._

- ~~A PINNED tag for the Whisparr list, the unfiltered facets and tiles working sets and
  `sceneStashIdMap` (F1); the computed facets and tiles cached under snapshotted keys (F6)~~.
- ~~The Whisparr list as a 16-field projection, patched after a Get (F2)~~; Whisparr v3 cannot
  filter `/movie` by performer or studio ([[whisparr-api]]), so the list stays.
- ~~StashDB covers through the media proxy (server F3, client F5)~~ done:
  [[2026-10-31-covers-shelf-skeletons]].
- ~~The finished `HomeRow[]` cached per visit seed (F7); weak ETags on `/api/*` (client F10);
  `performers[].image` out of `SCENE_CARD` (F9)~~. Measured live 2026-10-31: `/api/home`
  17 ms, tiles 9 ms, facets 7 ms right after the deploy; 304 on a matching ETag; a phone
  performer page 254 KB (was 679) ([[caching]] Measurements).

### Phase 2: rendering and layout stability (client, M)

_Shipped 2026-10-31 ([[2026-10-31-ux-phase2-3-web]]); the Player's time state followed the same day._

- `content-visibility: auto` on cards and rows, or virtualise the grid, so append cost stops
  growing (F1); render Home rows below the fold lazily, or 12 cards per row with "See all"
  (F2, a product choice); Tags page tiles in chunks on a sentinel with tile-sized `sizes` (F3).
- No layout shift: ~~reserve the station row's height (done, [[2026-10-31-ux-phase2-3-web]]);
  the wanted shelf below the grid (F4); entity header skeletons with the grid fetching in
  parallel instead of a spinner (F6, phone 11)~~ done: [[2026-10-31-covers-shelf-skeletons]].
- ~~`time`/`buffered` out of the Player's state into the SeekBar or an external store (F11).~~
  Done: `createClock()` in `lib/playback.ts`, subscribed by the SeekBar, the time readout and
  the mini progress line ([[player]]).

### Phase 3: phone flows (M)

_Shipped 2026-10-31 ([[2026-10-31-ux-phase2-3-web]]); the Filters dialog order followed the
same day; the shelf placement is the wanted-shelf initiative. The "2 filters" chip is covered
by the bar's own "Filters 2" button, so the tab badge stays a number like Continue's._

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

- ~~Settings: an `h1`, a sticky section list, Clean up moved to a "Library tools" group near
  Cache (desktop 11, IA F9); copy table in `desktop.md` §4 applied (device-neutral verbs, one
  spelling, "Save" vs "Saved", PIN placeholders, labelled panic URL field).~~ Done:
  [[2026-10-31-ux-copy-settings-errors]] ([[settings-page]]).
- ~~Related sidebar capped with a "More like this" grid below, or sticky with its own scroll
  (desktop 10); "Pick up a station" below Featured or beside the hero at `xl` (13); About as
  a real button with inline facts and a deduped "Links (27)" disclosure (14).~~ Done
  2026-10-31: capped at 8 with the grid, below Featured, a real button with a Links
  disclosure ([[2026-10-31-ux-phase4-desktop-polish]]).
- ~~Right-click: skip `preventDefault` with Shift (12); Shift+click range select and
  Cmd/Ctrl+A in select mode (24); NEW badge always visible at low opacity (18);
  `prefers-reduced-motion` for the card zoom and previews (19); card meta contrast (21).~~
  Done 2026-10-31 ([[browse-and-filters]], [[mobile-first-ui]]), the hero included.
- ~~Station cover placeholders (26); tile skeletons for directories (27).~~ Done 2026-10-31,
  with the playlist page frame and the "Filter" chips on touch (phone 7, 11)
  ([[2026-10-31-ux-phase4-desktop-polish]]).

### Phase 5: vocabulary, freshness and errors (IA, S–M, several need a decision)

- ~~One vocabulary: Follow / Following for everything derived from Stash's performer favourite
  ("Performers I follow" filter, "New from performers you follow" rows, the station quick
  start); Favorites for the video heart; Pin for tags; one spelling in the UI (IA F2,
  desktop 8); Categories or Tags everywhere (IA F12, desktop 8); "Playlist" instead of a
  third "Save"; "Save station" (IA F19).~~ Done: [[2026-10-31-ux-copy-settings-errors]]; the
  strings in files other initiatives owned (Home/WantedRow hint, Tag eyebrow, Player O title)
  followed the same day. The Studios table header stays an uppercase eyebrow row like every
  other small heading, so "Network" renders as NETWORK by design.
- ~~Optimistic rollbacks on error for rating, follow, pin and performer rating; Moments' Undo
  toast on success only (IA F1); progress and Continue badge patched after `saveActivity`
  (IA F3); Identify polled server-side until finished (IA F6)~~ done:
  [[2026-10-31-ux-phase5-freshness]]; ~~Playlist Shuffle plays
  shuffled without rewriting the order (IA F5)~~ done in Phase 0; ~~a "Requested" state on wanted cards between
  Get and the grab (IA row 18)~~ done: [[2026-10-31-ux-phase5-freshness]].
- ~~Actionable errors: map "Stash: …" 502s to "Stash is busy or down (a scan locks it for a
  few minutes). Cached pages still work.", network failures to "No connection to flix"; client
  timeout below the server's so the server's reason wins (IA F15)~~ done in [[2026-10-31-ux-copy-settings-errors]]
  (the client timeout went above the server's instead, 65 s, so the server's reason arrives);
  ~~an HLS error state in the player instead of an endless spinner (IA F16, verify with a renamed
  file); a dim "Your performer defaults" chip when Settings' people filter shortens a list
  (IA F18)~~ done: [[2026-10-31-ux-phase5-freshness]] (verified with a dev-only `?src=missing`
  hook rather than a renamed file).
- ~~Settings in five groups (Library, Feed, Playback, Privacy, Advanced) with an anchor strip,
  one page ([[settings-next-to-page]] kept) (IA F9); fix `CachePanel`'s "within 60 s" to
  mention the 10-minute idle gate; remove or wire `useWhisparrActivity`.~~ Done:
  [[2026-10-31-ux-copy-settings-errors]] (the hook was removed).

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
11. ~~A 480-px image variant for desktop grids (client Q3)?~~ Yes: [[image-variant-480]] (2026-10-31).
12. ~~Browse on the phone: one column or two (phone 10)?~~ Two for now: [[browse-two-columns-on-phones]] (2026-10-31).

## Ground-up review roadmap (2026-11-10)

From [[2026-11-10-architecture-and-ux-review]]; approved by the user 2026-11-10 and shipped the
same day except where marked open ([[2026-11-10-hardening]]). Also open: zod-parsing StashDB and
Whisparr responses, a typed route map in `@flix/shared`. The pre-push hook is in
([[run-checks]]).

**Hardening** (each one initiative)

- ~~**H1. Stop losing data**~~ Done 2026-11-10: tag writes are deltas, studio and category lists load whole, error boundaries.
- ~~**H2. Gate what ships**~~ Done 2026-11-10: the image build runs lint and tests, the server is linted, assets are gzipped, unhandled rejections are logged. The privacy check stays local: its deny-list is not in git.
- ~~**H3. Fresh data on the phone**~~ Done 2026-11-10: 5-minute freshness for settings, favourites and session; live markers in the player; lists no longer refetch every page on focus; the last progress save uses keepalive.
- ~~**H4. Cache correctness**~~ Done 2026-11-10: the snapshot carries the build; a Stash change leaves Whisparr and StashDB entries alone.
- ~~**H5. Split the two big server files**~~ Done 2026-11-10: `stash/`, `routes/`, `home.ts`, `UpstreamError`, id validation.
- ~~**H6. One job registry**~~ Done 2026-11-10: `jobs.ts`; the hourly category sync is gated on the change fingerprint.
- ~~**H7. Tests where it deletes and downloads**~~ Done 2026-11-10: server tests 155 → 209, the web's first 10.
- **H8. One player core**: the shared core is in (`pickSource`, `syncClock`, `useIdle`,
  `transportKey`, `PlayerParts.tsx`; [[player]], [[2026-11-10-polish-pass]]). Open, and only
  after a real-iPhone pass: one `<video>` lifecycle for `Player` and `StationPlayer`.
- ~~**H9. Wiki drift**~~ Done 2026-11-10: `server-bff`, `stash-layer`, `data-model`, `request-guard`, `caching`, `web-app`, `mobile-first-ui`.
- ~~**H10. Finish the neutral suite**~~ Done 2026-11-10: every headless script is neutral by
  default, names print only on `--names` / `--show`, the server logs ids ([[neutral-observability]]).

**UX revamp**: U1–U5 shipped 2026-11-10 ([[2026-11-10-ux-revamp]], [[ui-system]],
[[continue-strip-on-home]]); the items it left open shipped the same day
([[2026-11-10-polish-pass]], [[search-recents]]). Still open:

- A pass on the real iPhone: the sheet drag, the header slide, the press states, pull to
  refresh, the card-to-player transition.
- About 130 raw buttons onto `Button` / `IconButton`, a screen at a time.

## Stash and Whisparr operations (moved from the nas repo, 2026-11-02)

Stash and Whisparr are run from here now (`private/wiki/integrations/stash-instance.md`, `private/wiki/integrations/whisparr-instance.md`,
[[stash-and-whisparr-clients]]). Open items that came with them, from the nas repo's do-later list:

- **Whisparr collections** (`private/wiki/history/2026-10-25-whisparr-collections.md`): finish the paced bulk fill and
  write its outcome there; in a few weeks re-crawl for new uploads and retry per-scene searches
  for the ~630 still unmatched. Under the current policy ([[whisparr-nothing-monitored]]) any
  such fill is one scene at a time.
- **Whisparr v2 leftovers**: delete `/volume1/Flotilla/.flotilla/whisparr`, SABnzbd's `adult`
  category (v3 uses `adult3`), and in the Portainer stack env remove `WHISPARR_UI_PORT`, add
  `STASH_UI_PORT` and `WHISPARR3_UI_PORT` (the nas repo's `nas-portainer.py drift` reports them).
- **Keys in flix's `.env`**: `scripts/stash.py` and `scripts/whisparr.py` need `STASH_URL`,
  `STASH_API_KEY`, `WHISPARR_URL`, `WHISPARR_API_KEY` there (filled by hand). Not yet tested
  live from flix.
- **nas repo cleanup**: replace its Stash and Whisparr sections with pointers here (services rows,
  known-issues #38 and #40, the two operations runbooks, three history files, the arr.py and
  stash.py rows, `browser/`, `inventory/arr/whisparr3/`, media policy 4, the CONTINUE items).
  Not done: the nas folder has no git, so nothing there is changed without the user.
- **Follow sync**: built 2026-11-02, turned into the guard the same night ([[whisparr-sync]]):
  Whisparr monitors only scenes flix fetched; discovery and Discover run on the StashDB mirror
  ([[stashdb-mirror]], [[discover]]). Open: adding performers Whisparr lacks is no longer needed
  (flix adds scenes by StashDB id).
- **Whisparr cleanup**: done 2026-11-02 ([[whisparr-cleanup]]): 25,457 file-less records deleted.
  Open: Whisparr still lists ~1.4k studios and ~6.8k performers, most now without scenes.

## Backlog

- **TPDB as a second stash-box endpoint in Stash**, optional: only if StashDB coverage gaps
  appear. Needs the user's TPDB API key; configured in Stash, then flix's [[stashdb]] layer
  would read a second endpoint. Chromecast was dropped ([[airplay-not-chromecast]]).

- **Scrubbing, to tune from use**: fine scrubbing (slower as the finger moves up from the
  bar) and the picture swipe in the station player ([[seek-bar-markers]]).


- ~~**Open**: keep or drop the ad-hoc "Station" entry points~~ Decided 2026-11-09: they fold
  into the Stations tab ([[five-tab-navigation]], initiative G).
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

- Does Whisparr's daily `RefreshStudios` still add newly released scenes to a studio whose
  new-items flag is off? Baseline for a later diff: 9,363 scenes across 36 studios at
  2026-10-30 17:00 UTC ([[whisparr-nothing-monitored]], [[whisparr-api]]).
- The duplicates workbench has never seen a real group: the library had none at any distance
  on 2026-10-30 ([[duplicates-workbench]]).
