---
title: Log
kind: hub
summary: Append-only record of wiki operations (init, ingest, correct, decide, lint, query), newest last.
tags: [wiki, meta]
status: current
verified: 2026-10-30
updated: 2026-10-30
---

# Log

One entry per operation, appended at the end: `## [YYYY-MM-DD] <op> | <title>` and one to
three lines. `grep '^## \[' wiki/log.md | tail -5` shows the latest. See [[CONVENTIONS]].

## [2026-10-30] init | Wiki created
Conventions, tooling (`scripts/wiki.mjs`) and the first pages. Sources migrated: the former
25 KB `CLAUDE.md`, `docs/plan.md` (now history pages and `roadmap`), the flix-facing rows of
`nas:docs/services.md` and `nas:docs/known-issues.md` #40, `k8s:docs/flix.md`, and the agent's
memory notes about flix.

## [2026-10-30] correct | Verified the writers' unsourced facts against the code
Test count 59 → 69; the quality menu's stall window is 30 s; the scene page's O button creates an
`O` marker after 3 s of play; four gotcha `symptom` lines were guessed error messages and now
describe the observed symptom instead, with `found:` marked inferred where it came from the fixing commit.

## [2026-10-30] ingest | Relative scrubbing and picture swipe
Seek bar: taller touch area, relative 1:1 drag, tap to jump; a sideways swipe on the picture
scrubs ([[2026-10-30-relative-scrubbing]]). Corrected [[run-checks]] and
[[coding-conventions]]: `pnpm typecheck` skips the web app, and lint has 5 known warnings.

## [2026-10-30] query | How the installed iOS app gets a new build
No service worker; `index.html` has no `cache-control`, iOS resumes the suspended app, and a
missing chunk is answered with `index.html` → [[installable-app#how-a-deploy-reaches-it]].

## [2026-10-30] ingest | The open app follows deploys
Page names its build and is `no-cache`, missing assets 404, `lib/update.ts` reloads with loop
limits → [[installable-app#how-a-deploy-reaches-it]], [[2026-10-30-app-follows-deploys]].

## [2026-10-31] ingest | Review round: eight initiatives
Resized thumbnails, request guard, Home state, cache correctness, blocklist and Continue data
quality, ghost sweep, instant scene opens, Related fallback → [[2026-10-31-review-round]];
new page [[request-guard]]; corrected [[media-proxy]] (CORS was `*`) and [[home-feed]] (seed).

## [2026-10-31] decide | Playlists ignore the blocklist; only stations you made are remembered
Two user decisions → [[playlists-ignore-blocklist]], [[stations-only-user-made]]; Continue's 13
finished resume points cleared; Featured pool slimmed → [[2026-10-31-home-speed-and-stations]].

## [2026-10-31] ingest | Activity query and the pool across restarts
Tag sizes from one `findTags`, not `scene_count` per scene (cold Stats 0.5 → 0.05 s); the
Featured pool is snapshotted → [[featured-ranking]], [[caching]], [[2026-10-31-home-speed-and-stations]].

## [2026-10-31] decide | Scripts are the hands: use one first, write one when none fits
User rule: scriptable operations get a registered script; `scripts/manifest.json`,
`scripts.mjs` (list/search/show/lint), `check.mjs`, `deploy-check.mjs` → [[scripts-library]],
[[2026-10-31-scripts-library]]; [[run-checks]] and [[deploy-and-verify]] now name the scripts.

## [2026-10-31] ingest | Row or grid for the Not-in-your-library shelf
Row/Grid toggle per browser (`flix.wanted.view`); Grid loads StashDB pages by sentinel →
[[whisparr-shelf]], [[2026-10-31-shelf-grid-view]]; EVAL probe note in [[mobile-checks]].

## [2026-10-31] ingest | A way back from the mini-player
Expand button in the dock, `z-10` on the picture overlay (inferred WebKit hit-testing), new
`scripts/mini-check.mjs` → [[mini-player]], [[mobile-checks]], [[2026-10-31-mini-player-expand]].

## [2026-10-31] ingest | Mini-player restore: links, an on-device log, a WebKit check
Expand/title/picture are `<Link>`s; `lib/diag.ts` + Settings → Diagnostics; new
`scripts/webkit-mini-check.mjs` (real WebKit, iPhone emulation) also passes, so the phone's
failure is still unexplained → [[mini-player]], [[diagnostics]], [[mobile-checks]],
[[2026-10-31-mini-player-expand]], [[playwright-webkit-install-hangs]].

## [2026-10-31] ingest | tea actions runs lists the Forgejo runs
`tea actions runs` answers "did the push deploy" from the shell (status `running`/`success`);
a slow run today took over 10 min, past deploy-check's default wait → [[deploy-and-verify]].

## [2026-10-31] ingest | Deploy run 80 failed on trivy's DB download, re-run by hand
Build and tests green, trivy timed out on mirror.gcr.io after 5 min, nothing pushed; re-run
from the run page; tea cannot read logs on this Forgejo → [[trivy-db-download-timed-out]],
[[forgejo-ci]], [[deploy-and-verify]].

## [2026-10-31] correct | Trivy's DB comes from Docker Hub first, cached on dind, 15 min timeout
Re-run failed the same way; every default registry crawled from this ISP while Docker Hub did
131 MB in 33 s → deploy.yml changed; [[trivy-db-download-timed-out]] rewritten with the
measurements, [[forgejo-ci]].

## [2026-10-31] ingest | aed32a9 live: mini-player links + diagnostics, trivy from Docker Hub
Run 81 passed with the new scan step (29 min on a slow evening); deploy-check 9/9. The phone's
Diagnostics copy after a tap on Expand is the next evidence → [[mini-player]], [[diagnostics]].

## [2026-10-31] correct | The scan step retries: run 82 died on an unreachable IPv6 CDN address
Docker Hub's CDN resolved to IPv6 inside the job network; three replicas, three caches →
[[trivy-db-download-timed-out]].

## [2026-10-31] query | UX audit by five auditor agents, roadmap written
Server caching, client loading, phone, desktop and IA lenses, all read-only; raw reports in
`docs/audits/2026-10-31-ux/`; five scripts promoted (perf-check, phone-flow, desktop-check,
api-latency, media-probe) → [[2026-10-31-ux-audit]], [[roadmap]], [[perf-checks]], [[mobile-checks]].

## [2026-10-31] correct | Audit evidence against the wiki
Whisparr list 41 MB / 13k (was ~25 MB); the shared VOLATILE cap is the dominant miss cause;
Mark as watched is in the card menu; intro skip is set from the player, not the studio page →
[[caching]], [[whisparr-api]], [[scene-page]], [[people-pages]], [[settings-next-to-page]].

## [2026-10-31] ingest | UX Phase 0 web quick wins shipped
Landscape header, Pin sheet, 44 px targets, gutters, labels, memoised cards/rows, hero state,
image sizes, poster, hover cost → [[2026-10-31-ux-phase0-web]], [[mobile-first-ui]], [[mini-player]].

## [2026-10-31] ingest | The hero pages the Featured ranking instead of looping over 8
`offset` on /api/featured, `useMoreFeatured`, Hero fetches twenty more near its end →
[[2026-10-31-hero-pages-the-ranking]], [[home-feed]], [[featured-ranking]].
## [2026-10-31] ingest | Phase 0 server quick wins: softer write invalidation, volatile cap, Whisparr TTL, warm debounce, asset ETags
Ratings, O, edits and favourites drop one entity and expire lists ([[ratings-expire-lists]]);
`maxVolatile` 60 and StashDB pages out of VOLATILE; `LIST_TTL` 15 min; the re-warm waits for two
quiet polls and 5 min; resized and generated assets get a weak ETag → [[caching]], [[whisparr-shelf]],
[[stashdb]], [[whisparr-api]], [[stash-layer]].
## [2026-10-31] ingest | Phase 0 freshness quick wins
Global failed-write toast from the `MutationCache`; station edits invalidate previews and
resumes; remove-from-history and title/tag edits reach `scene`, `home`, `related`; deleting a
playlist deletes its `pl:<id>` resume row and nameless rows are dropped; Block gets Undo; the
pressed label is "Not interested ✓"; Shuffle plays a shuffled playlist station (`shuffle=1`)
and never rewrites the order. The gender-switch item was dropped by the owner →
[[web-app]], [[stations]], [[playlists-and-favorites]], [[people-pages]], [[scene-page]],
[[playlist-shuffle-plays-shuffled]], [[roadmap]].

## [2026-10-31] decide | Seven more audit decisions recorded
Shelf below the library, Categories + US spelling, panic key desktop-only, library tools in
Settings, gender switch page-only, home rows 24 lazy, toast-only errors →
[[library-before-wanted-shelf]], [[categories-and-us-spelling]], [[panic-key-desktop-only]],
[[library-tools-group-in-settings]], [[gender-switch-performers-page-only]],
[[home-rows-stay-24-render-lazily]], [[failed-writes-toast-only]].

## [2026-10-31] ingest | UX Phases 2 and 3 web shipped
Lazy rows and cards, chunked Categories, reserved station row, one-row phone filter bar with a
More sheet, card "⋯" and Save to playlist in the sheet, Delete relocated, gear menu as a sheet,
`components/Sheet.tsx` → [[2026-10-31-ux-phase2-3-web]], [[browse-and-filters]], [[player]],
[[scene-page]], [[home-feed]], [[mobile-first-ui]].

## [2026-10-31] ingest | Player time out of React state (F11)
`createClock()` in `lib/playback.ts`; the SeekBar, `TimeReadout`, the mini progress line and the
gear menu labels subscribe; the station page uses the same clock. `phone-flow`'s `tapText` now
skips hidden elements → [[player]], [[2026-10-31-ux-phase2-3-web]].

## [2026-10-31] ingest | Filters order, range select, native menu on Shift, reduced motion
Quick choices above the tag cloud; Shift+click range and Cmd/Ctrl+A in select mode; Shift+right-click
keeps the browser's menu; reduced-motion CSS and no hover previews. desktop-check takes
`shift`/`cmd`/`ctrl` → [[browse-and-filters]], [[mobile-first-ui]], [[2026-10-31-ux-phase2-3-web]].
## [2026-10-31] ingest | Copy pass, Settings in five groups, actionable errors
Categories, US spelling and Follow applied across the web and the server row titles; Settings
regrouped (Library, Feed, Playback, Privacy, Advanced) under a sticky anchor strip with a
Discreet switch; `describeError` rewords Stash 502s, network failures and timeouts in ErrorBox
and the write toast (client timeout 45 s → 65 s); `useWhisparrActivity` removed →
[[2026-10-31-ux-copy-settings-errors]], [[settings-page]], [[web-app]], [[home-feed]],
[[browse-and-filters]], [[whisparr-shelf]], [[stations]], [[featured-ranking]],
[[discreet-mode]], [[scene-page]], [[roadmap]].
## [2026-10-31] ingest | StashDB covers proxied, shelf below the library, entity header skeletons
`/media/remote/<token>` (HMAC-signed URL, allowlist `stashdb.org`, same asset cache, `?w=`
resize: 280 KB → 19 KB at 640); `WantedShelf` after `SceneBrowser`, collapsed to its heading and
count (`flix.wanted.open`); `HeaderSkeleton` on performer/studio/tag pages with the grid
fetching from the first paint; tag eyebrow "Category" →
[[media-proxy]], [[whisparr-shelf]], [[people-pages]], [[library-before-wanted-shelf]],
[[stashdb]], [[request-guard]], [[server-bff]], [[caching]], [[roadmap]],
[[2026-10-31-covers-shelf-skeletons]].
## [2026-10-31] ingest | UX audit Phase 1: server caching and the page-local gender switch
PINNED working sets, computed facets/tiles/home-rows cached with `freshInputs`, Whisparr's list
as a patched 16-field projection, weak ETags on `/api`, cards without performer images, and
the Women/Men/Everyone switch decoupled from Home, Stats, search and the People filters →
[[caching]], [[whisparr-shelf]], [[whisparr-api]], [[home-feed]], [[stash-layer]],
[[people-pages]], [[data-model]], [[continue-history-stats]], [[browse-and-filters]],
[[gender-switch-performers-page-only]], [[roadmap]], [[2026-10-31-ux-phase1-server-caching]].

## [2026-10-31] ingest | Phase 1 and the cover proxy measured live
Build 1c7f070: home 17 ms, tiles 9 ms, facets 7 ms on a fresh process; 304 on a matching ETag;
proxied cover 19 KB, 5 ms warm; phone performer page 254 KB (was 679) → [[caching]],
[[2026-10-31-ux-phase1-server-caching]], [[roadmap]].
## [2026-10-31] ingest | UX audit Phase 4: desktop polish and loading states
Related sidebar capped at 8 with a "More like this" grid, "Pick up a station" after Featured,
About as a real button with a deduped Links disclosure, station cover placeholders, directory
and playlist skeletons (`Bone` in `ui.tsx`), "Filter" chips on touch, `LATENCY` for
`desktop-check` → [[scene-page]], [[related-videos]], [[home-feed]], [[people-pages]],
[[stations]], [[playlists-and-favorites]], [[mobile-first-ui]], [[mobile-checks]], [[roadmap]],
[[2026-10-31-ux-phase4-desktop-polish]].
## [2026-10-31] ingest | UX audit Phase 5: freshness and errors
Rollbacks on failed ratings, follows and pins, progress and the Continue badge patched after
each save, Identify waited for and followed on the server, a "Requested" wanted state, the
player's "Can't play this video" state and the "Your performer defaults" chip; phone-flow
gained `STUB` → [[web-app]], [[caching]], [[player]], [[whisparr-shelf]], [[moments]],
[[continue-history-stats]], [[browse-and-filters]], [[scene-page]], [[stash-api]],
[[mobile-checks]], [[phone-flow-tap-below-infinite-grid-lands-on-a-card]], [[roadmap]],
[[2026-10-31-ux-phase5-freshness]].

## [2026-10-31] ingest | UX audit roadmap: every phase live
Phases 4 and 5 merged and deployed (ce71950, 889567c); status paragraph with the measured targets
and what remains added at the top of the audit section → [[roadmap]].

## [2026-10-31] decide | iPhone first; 480 px variant; two-column Browse on phones
The user: the iPhone 17 Pro Max is the primary client, polish it over everything else →
[[iphone-first-polish]] (CLAUDE.md rule 6 reworded). Decisions 11 and 12 of the audit answered:
[[image-variant-480]], [[browse-two-columns-on-phones]].

## [2026-10-31] correct | The iPhone mini-player bug was the slot, not the taps
Scene to scene the leaving page's `leave()` cleared the slot the next page had attached, so the
next video opened docked over its own empty page; production only (StrictMode hid it in dev).
Fixed in `nowPlaying.ts` (the slot's ref owns it); `mini-check` drives scene to scene against a
production build → [[next-video-opens-docked-over-its-own-page]], [[mini-player]],
[[2026-10-31-mini-player-expand]], [[mobile-checks]], [[roadmap]]. Same commit: star fills
8 px off their outlines on touch screens (`touch:inset-2.5`).

## [2026-11-01] ingest | Deploy run queued behind another repo's jobs
c842bab's run sat `waiting` for over an hour while all three runners served tradesmanagerpro;
how to tell a queue from a dead runner → [[deploy-run-waiting-runners-busy]], [[deploy-and-verify]].

## [2026-11-01] query | Forgejo queue drained: run 6474 succeeded, c842bab live, smoke routes 200

## [2026-11-01] decide | Public GitHub repo BoomstickSoftware/stashtube; Forgejo stays the deploy remote; README and deploy/docker-compose.yml for newcomers
## [2026-11-01] ingest | README screenshots recipe (discreet mode + injected text blur, phone-flow against production)
## [2026-11-01] decide | MIT license for the public repo; the app keeps the name flix for now

## [2026-11-02] correct | Whisparr studios reset to unmonitored (178/178, new items off); 4,844 scenes still monitored
## [2026-11-02] correct | Whisparr scenes, movies and performers unmonitored too; performer/editor returns 400, cleared one by one
## [2026-11-02] decide | Favourite performers (30) monitored in Whisparr for new scenes only; back catalogue stays unmonitored
## [2026-11-02] ingest | Stash and Whisparr operations moved from the nas repo: clients, config snapshot, browser filter, service pages, two gotchas, two runbooks, three history pages
## [2026-11-02] query | Sync options between flix, Stash and Whisparr written up as a proposal
## [2026-11-02] decide | Library content stays out of git: gitignored private/ for named pages and snapshots, privacy-check in check.mjs, 12 tracked names scrubbed
## [2026-11-02] decide | Follow sync built: following monitors new releases in Whisparr, blocking unmonitors, watch state shown; rule 9 narrowed
## [2026-11-02] ingest | History: operations move, privacy check, follow sync; watch line holds its height
## [2026-11-02] decide | Whisparr sync widened: favourite studios too, everything else unmonitored, old scenes trimmed; run by scripts/whisparr-sync.mjs
## [2026-11-02] ingest | Follow from every list: one heart on performer, studio (all views) and category cards; categories say Follow, not Pin
## [2026-11-02] ingest | Whisparr cascades a watched performer's flags and tags to their studios and co-performers; the sync counts its own watch rows
## [2026-11-02] correct | The sync reads Whisparr fresh each run; a cached list missed the cascade
## [2026-11-02] query | Whisparr metadata: unwatched studios stop learning scenes; StashDB-driven auto-Get proposed
## [2026-11-02] ingest | Whisparr global "monitor new items" switched off by the user: discovery without monitoring or search
## [2026-11-02] decide | The sync fetches new releases of followed ones (one Get each); rule 9 restated
## [2026-11-02] decide | Whisparr monitors only scenes flix fetched; the sync becomes a guard; rule 9 restated
## [2026-11-02] ingest | StashDB mirror, rate limiter and paced Get queue (architecture/stashdb-mirror); Discover page (features/discover)
## [2026-11-02] ingest | Whisparr cleanup: delete file-less records nothing is fetching, after a Backup, tested on one studio first (architecture/whisparr-cleanup)
## [2026-11-02] correct | Discover cards kept Requested after a Get only on shelves; now patched everywhere, and a repeat Get within the hour searches nothing
## [2026-11-02] ingest | Whisparr cleanup run in full: 25,457 records deleted, 0 errors; history page for the StashDB mirror initiative
## [2026-11-02] ingest | Settings switch on: guard every 15 min, daily discovery; Gets of new scenes add studios and performers with flags on, which the guard turns off
## [2026-11-02] decide | Whisparr cleanup widened by the user: every record without a file goes unless downloading or a waiting flix Get; empty studios too
## [2026-11-02] ingest | Widened Whisparr cleanup run: 10 scenes and 1,270 empty studios deleted; 2,683 records with files and 125 studios remain
## [2026-11-02] decide | Whisparr cleanup covers performers too: one with no remaining scene (by id or name) is deleted
## [2026-11-02] correct | Performer cleanup deleted 5 feature film records (files kept): films keep cast in credits; cleanup now keeps credited performers, records restored
## [2026-11-02] decide | Deleted scenes are never fetched again automatically (fresh exclusions in discovery, exclusion for gone files); a Get by hand is respected, cards show "Deleted before"

## [2026-11-04] ingest | Library reconciled: disk, Stash and Whisparr are one set again
`scripts/library-reconcile.mjs` (runs in the flix pod) found 3 unscanned imports, 1 film Whisparr
lacked and 101 scenes without their StashDB link; scanned, added, linked and filled them. Identify
matches by fingerprint only, the wiki said otherwise → [[identify-leaves-linked-scene-bare]],
[[library-reconcile]], [[stash-library]] corrected; names and numbers in
`private/wiki/history/2026-11-04-library-reconcile.md`.

## [2026-11-04] correct | The 47 Stash/Whisparr id conflicts resolved in Stash
The file decides (release name, runtime, fingerprint); 32 relinked, 4 pack files unlinked, 23 left
on purpose; `--link` now skips ids another scene holds → [[library-reconcile]] (conflict rules),
[[stash-library]]; names in `private/wiki/history/2026-11-04-library-reconcile.md`.

## [2026-11-07] query | Scenes without categories: StashDB has none for them
195 untagged linked scenes, all untagged on StashDB itself and in Whisparr; no late tagging after
import; flix renders every tag → [[stash-library]].

## [2026-11-07] correct | A studio name reached a commit; history rewritten before the mirror saw it
Two unmirrored commits folded into one clean one and force-pushed to origin; `privacy-check.mjs
history` now scans what the next mirror push publishes, and the push step runs it →
[[github-public-mirror]], [[deploy-and-verify]].

## [2026-11-07] ingest | Shuffle everything on Home; Featured rolls hourly
Stations were already shuffled; Home gained a one-tap whole-library station card, and the Featured
seed is kept 1 h instead of 6 → [[home-feed]], [[stations]], [[featured-ranking]].

## [2026-11-08] query | How daily discovery picks scenes to fetch
Read `discoverNew`/`startGetQueue` in getqueue.ts; added its limits (timer from start, first-seen follow window, 5-page and 200 caps, tag blocks not applied) to stashdb-mirror.

## [2026-11-09] decide | Edu section
User chose: Edu videos held out of Home, Featured, For you, related and stations but shown in
Browse and search; Edu plays do not steer recommendations; "Edu" at /edu with a phone header
icon; categories managed on their page and in Settings → [[vault]],
[[edu-section-held-out-of-curated-views]], [[2026-11-09-edu-section]]; updated
[[blocklist-and-exclusions]], [[home-feed]], [[related-videos]], [[stations]], [[data-model]].

## [2026-11-09] correct | Edu hold ignored by Stash
Edu videos stayed on Featured and Recently added: Stash ignored a second `tags EXCLUDES` level.
Merged into the blocklist's criterion; deploy-check now tests the hold →
[[second-tags-exclusion-ignored]], [[vault]], [[2026-11-09-edu-section]].

## [2026-11-09] query | Whisparr studio search misses a studio whose release prefix differs from its slug
Prowlarr search for a studio Whisparr found nothing for: the indexers post under a shorter prefix than Whisparr's studio slug, so Whisparr's `slug + date` query returns 0. Filed as mode 5 in `private/wiki/gotchas/whisparr-matches-by-studio-and-date.md`.

## [2026-11-09] ingest | Filled a studio Whisparr cannot search by hand; Whisparr studio aliases are read-only
11 scenes grabbed through Prowlarr → SAB and imported by `movieId` after an ffprobe check. Whisparr ignores `aliases` on `PUT studio` (they come from StashDB). Details in `private/wiki/gotchas/whisparr-matches-by-studio-and-date.md`.

## [2026-11-09] decide | Unlisted and the Vault
User chose an Unlisted level for videos, categories, performers and studios, one Vault replacing
Edu, the all-reasons rule for related videos, and fetch-but-never-feature for new releases →
[[unlisted-and-vault]], [[vault]], [[2026-11-09-unlisted-and-vault]]; superseded
[[edu-section-held-out-of-curated-views]]; updated [[blocklist-and-exclusions]], [[home-feed]],
[[related-videos]], [[stations]], [[data-model]].

## [2026-11-09] correct | Vault with an age filter overflowed SQLite's parser
The Vault's OR cap of 32 let 27 age buckets through; `parser stack overflow`, 502. Cap now 16;
deploy check covers it → [[sqlite-or-chain-overflow]], [[vault]], [[2026-11-09-unlisted-and-vault]].

## [2026-11-09] ingest | Discover leaves VR out
Settings switch (on by default) and `isVrScene` → [[discover]], [[settings-page]], [[2026-11-09-discover-hides-vr]].

## [2026-11-09] ingest | Discover: Not in motion, Show blocked & VR
Two chips on Discover: only scenes not owned or on their way (`fresh=1`), and blocked and VR too
(`unblocked=1`, which the page could not set before) → [[discover]].

## [2026-11-09] ingest | Discover: Details and open-on-StashDB links
→ [[discover]], [[2026-11-09-discover-toggles-and-details]].

## [2026-11-09] ingest | Hand fill of a studio Whisparr cannot search (180 scenes)
Prowlarr crawl, SAB in batches of 4, ffprobe check, ManualImport by movieId; details and state in `private/wiki/history/2026-11-09-futanari-xxx-fill.md` (private: names the studio).

## [2026-11-09] correct | Discover details as category pills; deploy check's source video
Details: coloured category pills linking to library categories, no code or date → [[discover]];
the deploy check no longer trusts a refreshing list for its normal video.

## [2026-11-09] decide | Cast categories
User chose F / M / X letters (trans and non-binary as X), one mix plus cumulative counts as Stash
categories kept in sync by flix, and Cast: M blocked → [[cast-taxonomy]], [[cast]],
[[2026-11-09-cast-categories]]; [[data-model]].

## [2026-11-09] ingest | Browse Cast filter
Filters → Cast: per-letter counts and Mix chips as category includes / excludes → [[cast]],
[[2026-11-09-cast-categories]].

## [2026-11-09] ingest | Cast set by hand
A video whose performers miss someone (a men-only video with an unidentified woman) can have its
cast set on its page; the sync files it by the override → [[cast]], [[data-model]],
[[2026-11-09-cast-overrides]].

## [2026-11-09] ingest | Discover: stronger hover pills, About sheet
Hover pills' background 0.16 → 0.36; ⓘ on each card shows StashDB's description, stored in
`sdb_scenes.details` (migration 0011) → [[discover]], [[stashdb-mirror]].

## [2026-11-09] decide | Strategy review: Continue reset, one hide model, five tabs

Reviewed navigation, menus and server load ([[2026-11-09-strategy-review]]). The user decided
[[continue-clears-and-expires]], [[hide-means-delete-block-or-unlist]] and [[five-tab-navigation]];
initiatives A–G went into [[roadmap]].

## [2026-11-09] ingest | Cache tags round (initiative A)

Plays and progress saves no longer delete Home and the facets; the Cast sync no longer wipes the
cache or re-triggers itself; `sceneStashIdMap` tagged `library`; tiles read the whole library;
snapshot not rewritten for expiries alone ([[2026-11-09-cache-tags-round]], [[caching]], [[cast]]).
Corrected the 2026-10-31 claim that the old feed showed at once after a play.

## [2026-11-09] ingest | Continue reset (initiative B)

Select → Remove, card-menu and scene-page Remove, the 30-day expiry and Mark as watched clearing
the resume point ([[2026-11-09-continue-reset]], [[continue-history-stats]]).

## [2026-11-09] correct | Discover About opens on hover
The ⓘ popover opens on hover with a mouse, without a backdrop (user) → [[discover]].

## [2026-11-09] ingest | Background load round (initiative C)

Whisparr guard paced by use and the switch, Featured seed every 5 min with a cached ranking,
`sdb_queries` pruned after 30 days, a cheaper Because-you-watched
([[2026-11-09-background-load]]). The first Continue expiry cleared nothing (the oldest
resume point without a play reaches 30 days on 2026-11-24).

## [2026-11-09] query | Featured timings after initiative C

Production, a new seed: `/api/featured` 122 ms on first call (pool ranked once), hero pages
(offset 24, 44) 51–54 ms (card fetches for new ids only), the same request again 7 ms; `/api/home`
for a new seed 21 ms. Before: 31–39 ms of ranking on every call ([[featured-ranking]]).

## [2026-11-09] ingest | One hide model shipped (initiative D)
Block left the library lists (downloads only: Discover, the not-downloaded shelf, the automatic Gets); Not interested opens the delete; Settings has one Hidden section; Cleanup lists old Not interested videos. Rewrote blocklist-and-exclusions and CLAUDE.md rule 4; playlists-ignore-blocklist superseded; Cast: M block left inert at the user's word. History: 2026-11-09-hide-model.

## [2026-11-09] ingest | Scene page ⋯ menu shipped (initiative E)
The scene page's row is Stars, O, Favorite, Playlist, ⋯; ⋯ opens CardMenu in page mode (Mark as watched, Remove from Continue, Unlist, Identify, Delete). Identify's run moved into useIdentify so it survives the menu closing. History: 2026-11-09-scene-menu.

## [2026-11-09] ingest | History rework shipped (initiative F)
History is one row per video per day, paged 40 at a time, with Select and bulk Remove; removal deletes exactly those plays in Stash (sceneDeletePlay) and Undo re-adds them (sceneAddPlay). History: 2026-11-09-history-rework.

## [2026-11-09] ingest | Five-tab navigation shipped (initiative G)
Tabs Home, Browse, Stations, Discover, You; header Search, Privacy menu, Settings; Browse strip; /you hub; Station chips replaced by the Stations tab's Start from; Settings › Feed › Home rows. New feature page navigation; history 2026-11-09-navigation. Strategy roadmap A–G complete.

## [2026-11-09] decide | Discover cards: one thing per corner
At the user's request: the StashDB badge went, ⓘ About moved to top left, ↗ stays top right, Get bottom right, "Deleted before" bottom left ("Deleted" on phones). Tapping the picture to open About was proposed and declined (hides the information behind a tap; hover and the ⓘ allow quick review). Recorded in features/discover.

## [2026-11-09] ingest | Exact names first in the pickers
User report: an exact category was crowded out of the search list. Discover's picker took StashDB's first 12 (no "Creampie" for "creampie"); now 30 plus an exact lookup (findTagOrAlias / findStudio by name), ranked by rank.ts. Library /api/search and /api/tags?q rank the same way. Pages: stashdb-mirror, search.
