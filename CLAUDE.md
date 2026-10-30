# flix

A tube-style web front end for the adult library on the NAS. **Stash is the headless
backend**: it scans, fingerprints, scrapes StashDB, generates sprites and previews, and
hardware-transcodes (VAAPI on the NAS's N5105). flix adds the UI and what Stash lacks:
playlists, a global blocklist, a home feed, related videos. Single user, LAN only for now.

| Repo | Owns |
|------|------|
| this | flix code, Dockerfile, design notes |
| `~/code/nas` | Stash's config and the NAS side: the NFS export flix reads, Stash API facts (`docs/services.md`) |
| `~/code/flotilla` | The compose stack that runs Stash |
| `~/code/k8s` | Where flix runs, as flix.lan (`infra/flix/`: namespace, CNPG, NFS PV, ingress, secrets). A push to `main` here builds the image in Forgejo CI and commits its digest there; ArgoCD rolls it out. `docs/plan.md` phase 3 has the details |

## Layout

```
apps/server     Hono BFF on Node 26 (runs .ts natively, no build step)
  src/stash.ts    every Stash GraphQL call and the Stash→flix mapping; nothing else knows Stash's schema
  src/stash.schema.ts  generated (graphql-codegen) from stash.schema.graphql, Stash v0.31.1's own schema:
                  filter inputs are exact types (an unknown criterion is a compile error, not a 400),
                  object types describe responses whole though each query selects a subset. After a
                  Stash upgrade: `pnpm --filter @flix/server schema` (STASH_URL + STASH_API_KEY in the
                  env, or a saved introspection JSON as the argument), then `codegen`; commit both files.
  src/media.ts    /media/stash/* proxy (adds ApiKey, rewrites HLS), /media/play/:id direct file
  src/api.ts      /api routes (zod-validated)
  src/db/         Drizzle schema + migrations (drizzle/), migrate on boot
apps/web        Vite + React 19 + Tailwind 4 + TanStack Router/Query
  src/routes/     one file per path (TanStack file routing: `scene.$id.tsx`, `stations_.new.tsx` is
                  /stations/new outside /stations); search validation lives here, the page in src/pages/.
                  The Vite plugin writes src/routeTree.gen.ts (committed) and splits every page into
                  its own chunk, loaded on intent.
packages/shared API contract types shared by both (types only at runtime on the server)
```

## Rules

1. **The browser never talks to Stash and never sees the API key.** All Stash URLs go
   through `mediaUrl()` → `/media/stash/...`. The proxy allowlists `/scene|performer|studio|tag|group/`.
2. **Stash owns ratings, play counts, resume points, O-counts, markers, performer/studio
   favourites, titles and tags** (so its UI stays consistent). Postgres holds only what Stash
   cannot: playlists (including the built-in Favorites list behind the heart on videos; Stash
   scenes have no favourite flag), the blocklist, pinned home rows, saved stations and where each station was left (`station_resume`), and settings (performer
   gender switch, per-studio intro skip, panic URL). Settings live next to the page they
   affect, not on the Settings page, unless they are global.
   Markers created in flix use the Stash tag "Highlight" (created on first use). "Not interested"
   on a video adds the Stash tag "Not interested" (also created on first use); `exclusions()` treats
   that tag as blocked, so the video leaves every list, and Settings lists them to undo.
3. **The web app only knows `@flix/shared` types**, never Stash shapes, so the backend can
   be replaced piece by piece later.
4. **Blocklist** applies to every list, search, feed and related query unless `unblocked=1`.
   An id the query explicitly includes (a performer page, a tag filter) overrides its block.
5. Server code must be erasable TypeScript (`erasableSyntaxOnly`): no enums, namespaces or
   parameter properties; relative imports end in `.ts`; type-only imports use `import type`.
6. Page components that use `getRouteApi` declare `: JSX.Element` return types; without it the
   router's types go circular. A `navigate({ to: '.' })` reducer gets the union of every route's
   search, so cast `prev` (`(prev) => ({ ...(prev as SceneQuery), ...patch })`).
7. **Browser-side preferences go through `lib/storage.ts`** (`useStored`, `readStored`, `writeStored`):
   localStorage can be missing or throw (private mode, blocked site data), and the helper is the
   one place that handles it. On/off settings render with `Switch` from `components/ui.tsx`.
8. `useEffect` callbacks must not return a value: Chrome's `window.scrollTo` returns a Promise,
   which React then calls as a cleanup and crashes.
9. **Phones are a first-class client** (iPhone in particular). Use the `touch:` variant
   (`(pointer: coarse)`, defined in `index.css`) for finger-sized targets and touch-only UI,
   and `[@media(hover:hover)]:` for anything that may hide until hover. Never rely on hover
   to reveal a control. Inputs stay at 16px or larger on touch screens, or iOS zooms the page.
   Gestures that must not pan the page get `touch-action` (`touch-none`, `touch-pan-y`).
   Scene card previews follow the tube-site convention: on a touch screen a slight drag (10 px) on a
   thumbnail starts the preview and swallows the click that ends the drag; a tap still opens the video.
   One card previews at a time, and a preview stops once its card is mostly scrolled away (`SceneCard.tsx`).

10. **Deleting a video** (Delete in the multi-select bar, or next to Favorite on the scene page; both confirm first)
   goes through Whisparr, which owns the files: Stash mounts the library read-only. `delete.ts` finds the
   Whisparr entry whose file path equals the scene's (looked up by StashDB id, from Stash's link or the
   `[uuid]` in Whisparr's folder name; feature films by scanning the full list), deletes it with its files
   and an import exclusion so it is never grabbed again, then `sceneDestroy`s the Stash scene with its
   generated files and file record, and drops it from playlists. If any file has no Whisparr entry, nothing
   is touched. Needs `WHISPARR_URL`, `WHISPARR_API_KEY`, `WHISPARR_PATH_MAP`; without them `/api/features`
   reports `deleteScenes: false` and no button shows. Page grids pin their mobile column with `grid-cols-1`
   (`minmax(0,1fr)`): an implicit grid column grows to its widest child and the layout root clips it.

## Run locally

```sh
pnpm install
pnpm db:up                       # Postgres 18 on 127.0.0.1:5433
cp .env.example .env             # fill STASH_API_KEY (same key as ~/code/nas/.env STASH_API_KEY)
pnpm dev                         # BFF :8080 + Vite :5173 (proxies /api and /media)
```

Checks: `pnpm typecheck`, `pnpm --filter @flix/web lint`, `pnpm test`, `docker build -t flix .`

Tests are `node:test` files beside the code (`src/**/*.test.ts`, no test dependencies; the image
build runs them). They cover the pure parts where a mistake only shows as a Stash 500 or a silent
miss: the filter builder's nesting rules (`stash.test.ts`), the two caches, byte ranges and signed
links. `test-env.ts` supplies the env `config.ts` needs; nothing reaches Stash or Postgres.

Mobile checks (headless Chrome at iPhone 17 Pro Max size, against `pnpm dev`; plays, progress and deletes are blocked so Stash records nothing):
- `node scripts/mobile-check.mjs /tmp/m http://localhost:5173 / /browse /scene/<id>` reports
  horizontal overflow per page, including content cut off at the screen edge by the layout's clip, and saves screenshots (`W=932 H=430` for landscape, `DESKTOP=1`).
- `node scripts/touch-check.mjs /tmp/t http://localhost:5173 /scene/<id>` drives the player with
  touch events (tap, seek-bar drag, double tap, sideways swipe) and prints its state.
- `node scripts/card-check.mjs /tmp/c http://localhost:5173 /browse` checks the drag-to-preview on scene cards.

The check scripts start their own headless Chrome on a free port (`--remote-debugging-port=0`). _Until 2026-10-29_
they used port 9333 and silently attached to any Chrome left running there, so runs drove a stale page.

After changing a dependency's version while `pnpm dev` runs, Vite's pre-bundled deps can hold
two copies of a package. React Query is deduped in `vite.config.ts` because of this ("No
QueryClient set", 2026-10-27).

## Deploy

A push to `main` runs `.forgejo/workflows/deploy.yml` on the cluster's Forgejo runner: build the image
(`--build-arg GIT_SHA`, reported by `/healthz` as `version`), trivy scan, push to the Forgejo registry,
commit the tag@digest into `infra/flix/deployment.yaml` in the k8s repo, then wait until `/healthz` on
flix's LAN address (192.168.1.152, what flix.lan resolves to) reports that commit and smoke-test the
routes behind every page's first paint (home, tiles, tags, search, facets, performers, studios, the SPA).
A failure of either phase is posted to the forge Discord channel, naming the phase. Every push goes
live, so after one, check the run or `kubectl -n flix logs deploy/flix --since=5m` for `warming:` lines.

## Caching (goal: Stash does only real work)

| Layer | Where | What | Freshness |
|---|---|---|---|
| Query results | memory (`cache/memory.ts`, `dataCache` in `stash.ts`), saved to `CACHE_DIR/data.json` every 2 min and on SIGTERM/SIGINT, restored at boot; entries tagged `VOLATILE` (facet and tag-tile working sets, hundreds of KB per filter set) stay in memory only and are re-warmed | every GraphQL read, keyed by query+variables | TTL `DATA_CACHE_TTL_MINUTES` (360), then served stale for up to `DATA_CACHE_STALE_HOURS` (168) while one background refresh runs; concurrent identical reads share one request; Stash calls time out after 60 s |
| Browser | localStorage `flix.queries` (`main.tsx`, `PERSISTED` in `lib/api.ts`) | home feed, settings, favourites, playlists, blocklist | up to 7 days; painted at once on a cold open, then refetched in the background |
| Assets | disk `CACHE_DIR/assets` (`cache/assets.ts`), metadata kept in memory after first use so a hit costs no file reads | screenshots, preview clips, sprites, VTTs, performer/studio/tag images | URLs with Stash's version stamp `?t=` (screenshots, images) never expire, since a changed image gets a new URL (browser: 1 year, immutable); the rest (previews, sprites, VTTs) TTL `ASSET_CACHE_TTL_HOURS` (720), then revalidated by ETag (browser: 7 days); stale copy served if Stash is down or answers 404 (it does while a scan locks its database); new 404s remembered 1 min; "database is locked" reads retried with backoff; LRU under `ASSET_CACHE_MAX_MB` (5120); pre-fetched in full daily at `WARM_AT_UTC` (6) and from Settings › Cache (`warm.ts`, 4 at a time, fresh files skipped; sprites found through each VTT) |
| Not cached | | `/scene/<id>/stream*` (direct and HLS), all writes | |

Invalidation:
- **flix's own writes** go through `mutate()`, which drops the tags they affect: `scene`, `scene:<id>`, `performer`, and so on.
- **Plays and progress saves** (every 15 s while watching) drop only `scene:<id>` and the
  queries that filter or sort by activity (`activity:play`, `activity:resume`, set by
  `activityTags()`), and mark the rest of `scene` stale. _Until 2026-10-27_ they dropped
  every `scene` query, so watching anything left Home and Browse cold.
- **Changes made in Stash** (scans, Identify, edits in its UI) are caught by a change check: one query every `CHANGE_POLL_SECONDS` (60), only while flix has been used in the last 10 minutes. It compares each type's count and newest `updated_at`; any difference marks the whole query cache stale (served once more while it refreshes) and re-warms the home feed. _Verified 2026-10-26:_ `sceneSaveActivity` does not bump `updated_at`, so progress saves while watching don't trigger it; `sceneUpdate` does.
- **Warming:** the home feed, the unfiltered facets (the filter dialog's counts) and the tag tiles are built in the background at startup and after each Stash change.
- **Compression:** `/api/*` bodies are gzip'd (`hono/compress`); the home feed goes 108 KB → 17 KB. _Measured 2026-10-29._
- **Admin:** Settings → Cache shows hit rates and the requests actually sent to Stash, and has clear buttons (`GET /api/admin/cache`, `POST /api/admin/cache/clear {scope: data|assets|all}`).

_Measured 2026-10-26:_ a cold home view cost Stash 7 queries and 79 asset fetches; a warm view cost nothing.
_Measured 2026-10-27:_ cold `/api/home` 0.7–1.9 s, warm 4–8 ms; after a server restart it is
answered from the restored cache (10 ms, 0 Stash queries).

## Featured

The Home page's first row (and the hero above it) is the library ranked by `featured.ts`: ten
signals, each rank-normalised over the whole pool (`featuredPool()` in `stash.ts`: every scene
minus exclusions, one cached VOLATILE query), times the weights saved under the `featured`
settings key (Settings → Featured, shared across devices), plus `surprise` × `hash01(id:seed)`.
The seed is the page's: `useHome(seed)` sends one made at load, Shuffle makes another, and
anything without one (the warm, curl) gets the day's. `POST /api/featured/preview` scores
unsaved weights for Settings' live strip. Affinities come from `affinities()` (what you played,
rated and O'd), shared with For-you. New signal: add it to `FeaturedWeights` and `SIGNALS`,
its raw value in `rawSignals`, its words in `phrase`, and a dial in `FeaturedDials.tsx`.

## Playback

The client checks `canPlayType` for the file's container and codecs: if the browser can play
the file, it streams the original (`/media/play/:id`, byte ranges, from the NFS mount when
`MEDIA_PATH_MAP` resolves it, else Stash's direct stream). Otherwise it uses Stash's HLS
transcode (`stream.m3u8`, hls.js outside Safari), and also falls back to HLS on any media
error. _2026-10-26:_ 477/520 files are mp4/h264/aac; the other 43 (mkv hevc/h264-ac3, avi
mpeg4, wmv vc1, av1) transcode. The first HLS segment takes ~2.3 s.

A saved resume point is applied automatically, with a "Resumed at … · Start over" pill for 8 s
(Start over honours the studio's intro skip).

`lib/playback.ts` is what the video page's `Player` and the station player share: attaching a
source (direct, or HLS through hls.js), the watch accounting (a play after 20 s, time and
resume point saved to Stash every 15 s and on pause, end, leave and tab close), the key guard,
marker jumps and the flash label. A station in Full mode records plays and resume points like
the video page (so Continue, History and Most played see it); Moments mode records nothing.

On touch screens (`Player.tsx`):
- A tap shows or hides the controls; it does not pause. A double tap on the left or right
  third seeks 10 s. While the controls show, the middle has −10 / play-pause / +10 buttons.
- The seek bar previews while dragged and seeks on release. Hidden controls take no taps.
- Fullscreen: iPhone Safari can only make a bare `<video>` fullscreen, so it uses
  `webkitEnterFullscreen` (system controls). Elsewhere the player element goes fullscreen,
  and on Android a landscape video locks the screen to landscape.
- A phone turned sideways (`landscape and pointer: coarse and max-height: 520px`) gets the
  player fixed over the whole screen with flix's own controls, padded for the safe areas.
  The page behind it is never scroll-locked and the player is `touch-pan-y`: Safari only
  hides its address bar when the page scrolls, so a swipe up over the video gives the
  picture the whole screen (a "Swipe up" hint shows while the bar takes space). Locking the
  scroll, as the first version did, kept the bar on screen for good.
- **Installed** ("Add to Home Screen"; `public/manifest.json` and the Apple meta tags in
  `index.html`) flix runs standalone: no address bar at all, so the bar dance above never
  happens. Standalone has no browser Back, so the header shows one on phones below the top level
  (`display-mode: standalone`). Icons are rendered from `favicon.svg` with `qlmanage -t -s <px>`.
- The controls' gradient never takes taps itself (on a phone it covers the middle of the
  picture); only the bar and buttons inside it do.
- Speed and "Mark this moment" are in the settings menu (no keyboard on a phone).

## Status and next steps

See `docs/plan.md`.
