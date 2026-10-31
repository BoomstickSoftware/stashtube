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
