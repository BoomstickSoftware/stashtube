# flix plan

_Decided 2026-10-26._ Neither fork Stash nor rewrite it: keep Stash as a headless engine on
the NAS (where the iGPU does VAAPI transcodes) and build a new front end plus a small BFF.

Why not run everything on k8s: the cluster has no usable GPU. The Proxmox host's Ryzen 5 5600
has no iGPU, and the RTX 3060 Ti is shared into the Plex LXC through the host driver; passing it
through to a Talos VM would take it from Plex. Workers are 2 vCPU each, too weak for CPU
generation. So generation and transcoding stay on the NAS; flix itself is light.

## Spike results (2026-10-26, Stash v0.31.1)

- Filters with nested `AND` exclusions are fast (~0.2 s); `random_<seed>` sort is stable for paging.
- Generated assets: `screenshot`, `preview` (mp4), `vtt` + `sprite` (160×90 tiles, ~81 per scene)
  exist; animated `webp` is not generated (404). Stash sends `no-cache`; flix adds a 1-day cache.
- Direct stream honours `Range`; HLS playlists use root-relative segment paths (`/scene/…`),
  rewritten by the proxy; HLS works with the `ApiKey` header, no `apikey` query needed.
- Stash `/graphql` answers CORS with `*`, but flix never calls it from the browser anyway.
- Mutations available: `sceneUpdate`, `sceneAddPlay`, `sceneSaveActivity`, `sceneAddO`,
  `performerUpdate`/`studioUpdate` (favourite, rating).

## Phases

1. ~~Spike~~ done.
2. **MVP (done, running locally 2026-10-26):** home feed (continue watching, favourites,
   recent, discover, top rated, releases, most watched), browse with sort, quick filters, tag
   include/exclude and infinite scroll, typeahead search, scene page with custom player (sprite
   seek thumbnails, resume, play counting, keyboard, theater, autoplay next), related videos,
   performer / studio / tag pages with follow, rating and block, playlists (ordered, drag
   reorder, play all, shuffle), blocklist settings, optional password login.
2b. **BFF caching (done 2026-10-26):** query cache with change detection, disk asset cache,
   admin stats and clear (see CLAUDE.md, "Caching"). On k8s `CACHE_DIR` needs a volume: a
   local-path PVC keeps it across restarts, or an emptyDir if a cold start is acceptable.
2c. **UX round 1 (done 2026-10-26):**
   - Videos and performers:
     - AirPlay, with signed per-scene playback links that work without a login cookie.
     - Favorites: the heart on a video adds it to a built-in Favorites playlist, because Stash scenes have no favourite flag.
     - Performer follow hearts on tiles.
     - Performer gender switch (Women / Men / Everyone), saved per user.
     - Transparent studio tiles.
   - Home:
     - Continue moved to its own nav item, with History and Stats tabs.
     - Hero carousel: shuffled per visit, advances every 12 s, arrows and swipe.
     - Saved filters pinned as home rows (rename, reorder, unpin).
     - "For you" and "More with…" rows from watch, rating and O affinity, tags weighted by rarity.
   - Browse: category tiles, and multi-select with bulk Favorite and Add to playlist.
   - Player:
     - Quality menu: Auto drops to 720p after 3 stalls in 30 s.
     - Markers on the seek bar: `b` marks, `[`/`]` jump, markers listed as chapters.
     - Per-studio intro skip.
   - Scene page: inline title and tag editing; Identify on StashDB for one scene.
   - Panic key (double Esc).
   - Login rate limiting, and secure cookies behind HTTPS.
2d. **Mobile and speed round (done 2026-10-27)**, from use on an iPhone 17 Pro Max:
   - Speed:
     - Plays and progress saves no longer empty the query cache.
     - The query cache survives restarts, and the home feed is warmed at boot and after
       Stash changes.
     - The browser keeps the home feed, settings and playlists for an instant cold open.
     - Request timeouts on both sides.
     - All artwork pre-fetched nightly (06:00 UTC) and from a Settings button.
   - Player on touch:
     - Tap toggles the controls; double tap seeks; centre −10 / play / +10.
     - The seek bar seeks on release and takes no taps while hidden. No sideways panning.
     - iPhone fullscreen via the native video; Android locks to landscape; turning a phone
       sideways fills the screen, and a swipe up there hides Safari's address bar.
     - Speed and Mark in the settings menu.
   - Resume: "Resumed at … · Start over" pill.
   - Videos open paused unless Settings › Playback says otherwise; Play buttons, Play all and up
     next pass `?play=1` and always start.
   - Page:
     - No iOS zoom on inputs.
     - Safe-area padding for landscape and the tab bar.
     - The page cannot pan sideways.
     - Hover-only controls are visible on touch.
     - The playlist menu survives the keyboard opening.
2e. **Round 2 (2026-10-28)**, the user's priorities in order:
   - Done:
     - Delete videos through Whisparr: from the multi-select bar, or Delete next to Favorite on a scene.
     - The scene page shows the full description; file path, format and links fold under the tags.
     - The home carousel previews on a slight drag (touch).
     - Cleanup page (`/cleanup`, linked from Settings): lists below 720p, never watched (30+ days),
       rated ★2 or less, not on StashDB, possible duplicates (perceptual hash, distance 8). Selection
       is always on, blocked videos are included, and the filter bar narrows further.
     - Stackable filters: the Browse filters are kept per browser (`lib/filters.ts`). A "+" next to
       performers, studio and tags on a scene, and "Add to filters" on their pages, adds to them
       (performers and tags must all match; studios are any-of). The filter bar's "+ Filter"
       searches performers, studios and tags.
     - People filter: age at filming and ethnicity, matched on one performer of the Settings
       gender (Stash's own `performer_age` matches any performer, so a 40+ male co-star would
       count). Age is matched in yearly release-date buckets (two-year once the library spans
       more than 16 years; longer OR chains overflow SQLite's parser), right to about six months.
       Works in pinned rows; Settings › Performer preferences sets defaults for every list, the
       home feed and related videos (a list's own People filter replaces them; Show blocked
       drops them).
     - Studio families: the Studios page groups studios under their network (an "All of …" tile
       opens the combined feed: a studio page already includes sub-studios), independents last;
       A–Z keeps the flat grid. Studio counts include sub-studios (`scene_count(depth: -1)`).
     - Stations (`/station`): endless full-screen play from any list's filters ("Station" in the
       filter bar, so also performer, studio and tag pages; shuffled, no repeats until all have
       played) or from a scene ("Station" by Related: drifts through related videos). Skip only,
       no ratings: steer with filters. Full videos (after any intro skip; counts plays after 15 s),
       or Moments: a 30/60/90 s window around each marker, or at 20/40/60/80% when a video has none,
       fading out and in between them.
     - Saved stations: Save (with a name) on a playing station keeps it in the `stations` table
       (filters or starting scene, mode, window); `/stations` (desktop nav, phone header icon)
       lists them with covers to play, rename or delete, plus quick-start stations (Everything,
       Unwatched, Favourite performers, Top rated). Changing mode or window on a saved station
       updates it.
   - Next:
     4. Moments: an O-counter press also saves a timestamp marker; needs trying out before committing.
   - "Surprise me" dropped: the home carousel already does it.
2f. **Round 3 (2026-10-29)**, from use:
   - Stations page: each card cycles through screenshots of what it plays (4 s, crossfade, staggered, still under
     reduced motion) and shows its video count; quick starts are cards too. **New station** opens an editor
     (`/stations/new`, `/stations/<id>/edit`): name, mode, moment length, and the filter panel inline over a live grid
     of what it will play.
   - Resume: a playing station saves where it is (scene and second) every 15 s and on leaving, per station
     (`station_resume`, key `id:<n>`, `q:<filters>` or `from:<scene>`, newest 50 kept). A card with a saved spot
     shows "Resume …" and its picture resumes; **Shuffle** starts fresh, **Unwatched** plays only never-watched
     videos (`unwatched=1`, also honoured when drifting).
   - Station player: the video page's seek bar (`components/SeekBar.tsx`, shared with `Player`: sprite thumbnails,
     markers; Moments shade the planned windows and a seek plans a moment from there), ±10 s, previous video,
     Mark this moment, Favorite, and a list panel (side panel, bottom sheet on phones: played, now playing, up next;
     tap any to jump). Keys: arrows ±5 s, j/l ±10 s, n next, p previous, b mark, [ ] markers, q list. Arrow right
     skipped to the next video until this round.
   - Categories: pin a tag (Stash's tag favourite) from its tile or the tag page; pinned tags head the page.
   - Studios: Networks / Grid / Table views, Most videos / Name sort, Following; kept per browser.
   - Filters rethought (`components/Filters.tsx`). The old strip of chips with popovers is gone: its Tags, + Filter
     and People popovers sat inside the sideways-scrolling row, which clipped everything below the input, so
     searching showed nothing. Every list now has a **Filters** button (with a count), sort, and the filters in
     play as removable chips (excluded tags marked NOT); the bar is sticky from `sm` up only. Filters opens one
     dialog (full-screen sheet on phones, portalled to `body`): your filters; one search box for performers,
     studios, tags (Require / Exclude) and title words, with popular tags before typing; then Watched, Rating,
     Quality, Length, followed performers, age and ethnicity, and Show blocked. It edits a copy and applies on
     "Show N videos" (live count). The station editor shows the same panel inline, applying as you go.
   - Live counts in the filter panel (`GET /api/scenes/facets`, `sceneFacets` in `stash.ts`): one cached Stash query
     fetches the light fields of every video in the set (tags, performers, studio, rating, resolution, length, play
     state; ~0.5–0.9 s cold for the whole library of ~2,000) and the BFF tallies them. The panel shows "N videos
     match"; each choice shows what picking it would give (its own group left out, the rest applied), dimmed at 0;
     search results say "12 here · 865 in all", those in the set first, dimmed when none are; the tag suggestions are
     the most common tags in the set. Studios are any-of, so once one is picked the others keep library counts.
     Quality is bucketed locally (short side ≥ 700/1000/2000 px), close to but not exactly Stash's resolution enum.
   - Browse nav shows how many filters "Add to filters" has stacked (they live in this browser's localStorage).
2g. **Round 4 (2026-10-29)**, a review pass over the whole codebase, one commit per initiative:
   - Correctness: Related and For-you candidates reshuffle daily (`daySeed`; they were frozen by constant
     seeds); the unused playlist join on every scene load is gone; `/readyz` probes Postgres, not Stash (a
     scan must not take flix out of rotation); up-next items start playing; the favourites set is built once
     per load.
   - Players share `lib/playback.ts` (source attach incl. hls.js, watch accounting, keys, marker jumps,
     flash). The station falls back to HLS on a media error instead of skipping, records plays and resume
     points in Stash in Full mode, and binds its keys once.
   - One storage helper (`lib/storage.ts`) and one `Switch`; one `describeQuery` (`lib/describe.ts`) behind the
     filter chips, station summaries and pinned-row titles; hooks out of `ui.tsx`; chapters seek through a
     `PlayerHandle`; selection is a Set; lint is clean.
   - File-based routes (`src/routes/`, `@tanstack/router-plugin`, `autoCodeSplitting`): the main chunk went
     from 554 kB to 256 kB + a 124 kB shared UI chunk, pages load on intent, search types reach `navigate()`.
   - Server speed: asset hits read no files (metadata kept in the index); facet and tag-tile working sets stay
     out of `data.json` (`VOLATILE`); facets and tiles are warmed at boot; `/api` is gzip'd (home 108 → 17 kB);
     the session answer is persisted so a cold open paints at once.
   - Tests: `node:test` suites (`pnpm test`, run in the image build) for the filter builder's nesting rules,
     both caches, byte ranges and signed links.
   - Features: installable (manifest, icons, Apple meta, Back button when standalone); scrub sprite frames by
     moving the mouse across a card; picture in picture (`i`); `?` shortcuts overlay; "Not interested" (a
     Stash tag, excluded like the blocklist, undone from Settings); Home rows "Because you watched" and "Pick up
     a station"; an O-counter press marks the moment and chapter chips show their frame; deletes say what they
     free; a performer's page shows her age at filming on each card; discreet mode (the eye in the header,
     pictures blurred until hovered); a sleep timer on stations; a playlist as a station (`/station?playlist=`);
     a card menu on right-click or long press (play, station, favourite, watched, not interested, delete).
   - Not done from the review: a duplicates workbench over `findDuplicateScenes`, one endpoint for the
     station previews, splitting `lib/api.ts`. (The typed Stash layer followed the same day, below.)
   - Same-day fix: the "Not interested" tag was the first blocked id to reach `findTags`, whose
     `id: EXCLUDES` criterion Stash's tag filter never had (nor the performer and studio filters), so the
     tag browser, search and the tag tiles answered 502 in production for about four hours. Blocked ids
     are now dropped after the query, `Stash HTTP 4xx` errors carry Stash's message, and `finders.test.ts`
     checks every criterion key against the introspected filter schemas.
2h. **Featured (2026-10-30)**: the Home page's first row and Tonight's pick come from one scoring pass over
   the whole library (`apps/server/src/featured.ts`, pure; the pool and affinities from `stash.ts`). Ten
   signals, each rank-normalised 0..1 (dormant, shelf age, fresh, performer, tag, studio, watched, marked,
   rated, O-counter) times a weight the user sets (-1..1) on Settings → Featured, plus `surprise` × a hash of
   the scene id and the visit's seed. Defaults: dormant 0.4, shelf age 0.2, performer 0.5, tag 0.3, rated 0.3,
   watched -0.2, surprise 0.3, the rest 0. At most two picks per performer and three per studio. Every pick
   carries a `why` line. Weights live in the `settings` table (shared across devices, as decided); the seed is
   one per page load (`/home?seed=`, Shuffle on the row draws another). Settings previews the top 12 live
   while dragging (`POST /api/featured/preview`, unsaved). Tests in `featured.test.ts`.
   Follow-up the same day: the first deploy crash-looped because the image carried only the server's
   source and `featured.ts` imported the defaults from `@flix/shared`; the Dockerfile now copies
   `packages/shared/src` into the runtime stage, so the defaults have one home (shared) and value imports
   from there are fine. `imports.test.ts` pins that.
2i. **Markers on the seek bar (2026-10-30)**: `SeekBar` draws every marker as a tick (named ones yellow, the
   player's O marks thin and white; markers within 1% of the duration merge into one tick with a count,
   `groupMarkers` in `lib/playback.ts`). Hovering a tick shows its sprite frame with the title and tag;
   a click or a tap on the tick's 24 px pad seeks to the marker itself rather than where the pointer
   landed, and a drag that starts there still scrubs. `[` and `]` are unchanged and agree with the ticks.
   Verified with fake markers patched into the scene response (the library has none yet).
2j. **One request for station previews (2026-10-30)**: `GET /api/stations/previews?day=&q=` answers every
   station card at once (saved stations by id, quick-start queries by their JSON; `previews.ts` has the
   per-station daily seed and the bounded fan-out, tested). The Stations page went from one request per card
   (saved + 4 quick) to one; `/stations/resume` now names each station or playlist, so Home's pick-up shelf
   no longer loads the station and playlist lists.
2k. **`lib/api.ts` split by domain (2026-10-30)**: `lib/api/` holds client, scenes, people, playlists, stations,
   home and settings modules behind an `index.ts` that re-exports them, so every `from '../lib/api'` import
   still works. A pure refactor: the export list, all 66 query keys and the built chunks are unchanged.
2l. **Whisparr from flix (2026-10-30)**: performer and studio pages get a "Not in your library yet" shelf of the
   scenes Whisparr lists for them without a file (matched by StashDB id, newest first, with the download state
   from Whisparr's queue and last grabs); Home gets "New from your favourites, not downloaded" (recent releases
   from favourite performers, shown from 3 items). Each card has one button, Get, which monitors that scene and
   searches for it alone; the server refuses any other id shape and feature films, and nothing monitors or
   searches a performer or studio (library policy, known-issues #40). The 25 MB movie list is cached 2 min
   in memory only. Whisparr's calendar was empty even with `unmonitored=true` (nothing upcoming is ever added
   unmonitored), so the planned "Coming soon" row became the recent-releases row.
3. **Deployed to k8s** (2026-10-26, flix.lan): a push to `main` runs `.forgejo/workflows/deploy.yml`, which
   builds the image, scans it with trivy, pushes it to the Forgejo registry and commits the tag@digest into
   `infra/flix/deployment.yaml` in `~/code/k8s`; ArgoCD (automated, prune, self-heal) rolls it out. The
   manifests there: namespace, CNPG cluster, Deployment (1 replica, `/healthz` probes), Service, Ingress,
   `flix-app-secrets` and `flix-db-credentials` from `create-secrets.sh`, the read-only NFS PV of
   `/volume1/Media/adult` at `/media/adult` (export to the workers 192.168.1.134–136 is in `~/code/nas`),
   a `local-path` cache PVC. After a push, `kubectl -n flix get deploy flix -o wide` shows the image
   commit, and the pod log says `warming:` on anything the boot warm could not fetch. Since 2026-10-29 the
   workflow also waits for the rollout (`/healthz` reports the build's commit as `version`) and smoke-tests
   the first-paint routes; a failed build or a failed smoke test is announced in the forge Discord channel.
4. **Daily use**: the Stash UI becomes the admin console only (scans, Identify, settings).
5. **Backlog** (brainstormed 2026-10-26; Round 4 took scrub, Not interested, blur, PWA and PiP):
   - Mini-player that persists across pages (picture in picture covers the 80/20 for now).
   - Duplicates workbench: Stash's `findDuplicateScenes` groups side by side (resolution, bitrate, size),
     the worse copy pre-selected.
   - Private session (no history).
   - PIN lock after idle.
   - Done 2026-10-30: Whisparr integration (2l). Not Chromecast: the user has AirPlay.
   - Done 2026-10-29: typed Stash layer. `src/stash.schema.ts` is generated from Stash's schema
     (`stash.schema.graphql`, graphql-codegen); `Raw = any` is gone from `stash.ts`. Filter inputs are exact,
     so a criterion Stash lacks fails typecheck. Object types describe responses whole, but each query
     selects only its fragment's fields: anything else is `undefined` at runtime whatever the type says.
6. **Later**:
   - TPDB as a second stash-box endpoint in Stash.
   - A PWA, Chromecast.
   - A hosted endpoint behind strong auth (e.g. Cloudflare Access or Tailscale Funnel with an
     identity provider), not just the app password.
   - Decide whether to replace parts of Stash's backend behind the BFF.

## Known gaps

- A `navigate({ to: '.' })` reducer sees the union of every route's search type, so `prev` is cast
  (`StationEditor`); routes themselves are typed since Round 4's move to file-based routing.
- The `hls.js` chunk is 574 kB; it only loads for transcoded videos.
- Related videos are scored in the BFF from up to 120 candidates (same performers, studio, tags).
