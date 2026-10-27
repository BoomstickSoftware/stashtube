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
     - Random hero.
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
   - Player on touch:
     - Tap toggles the controls; double tap seeks; centre −10 / play / +10.
     - The seek bar seeks on release and takes no taps while hidden. No sideways panning.
     - iPhone fullscreen via the native video; Android locks to landscape; turning a phone
       sideways fills the screen.
     - Speed and Mark in the settings menu.
   - Resume: "Resumed at … · Start over" pill.
   - Page:
     - No iOS zoom on inputs.
     - Safe-area padding for landscape and the tab bar.
     - The page cannot pan sideways.
     - Hover-only controls are visible on touch.
     - The playlist menu survives the keyboard opening.
3. **Deploy to k8s** (next):
   - Image: build in Forgejo CI and push to the cluster registry.
   - `infra/flix/` in `~/code/k8s`: namespace, CNPG cluster (1 instance, local-path), Deployment
     (1 replica), Service, Ingress (LAN only, not cloudflared), Secret (STASH_API_KEY,
     FLIX_SESSION_SECRET), NFS PV/PVC (read-only).
   - NAS side (`~/code/nas`): read-only export of `/volume1/Media/adult` to the three workers
     (192.168.1.134–136), added to `ensure-exports` and `nas-post-firmware-update.sh`.
   - `MEDIA_PATH_MAP=/data/adult=/media/adult` with the NFS volume mounted at `/media/adult`.
4. **Daily use**: the Stash UI becomes the admin console only (scans, Identify, settings).
5. **Backlog** (brainstormed 2026-10-26, not picked yet):
   - Scrub sprite frames on card hover.
   - Mini-player while browsing.
   - "Not interested" on a single video.
   - Blur mode for thumbnails.
   - Private session (no history).
   - PIN lock after idle.
   - Install as an app (PWA).
   - Chromecast.
   - Whisparr integration: follow = monitor, a Coming-soon row, download state.
6. **Later**:
   - TPDB as a second stash-box endpoint in Stash.
   - Markers / chapters on the seek bar.
   - A PWA, Chromecast.
   - A hosted endpoint behind strong auth (e.g. Cloudflare Access or Tailscale Funnel with an
     identity provider), not just the app password.
   - Decide whether to replace parts of Stash's backend behind the BFF.

## Known gaps

- Router types: the code-based route tree loses search-param types in reducers (they are
  annotated by hand). Moving to TanStack's file-based routing plugin would restore them.
- The `hls.js` chunk is 574 kB; it only loads for transcoded videos.
- Related videos are scored in the BFF from up to 120 candidates (same performers, studio, tags).
