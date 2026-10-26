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
| `~/code/k8s` | Where flix will run (namespace, CNPG, NFS PV, ingress) |

## Layout

```
apps/server     Hono BFF on Node 26 (runs .ts natively, no build step)
  src/stash.ts    every Stash GraphQL call and the Stash→flix mapping; nothing else knows Stash's schema
  src/media.ts    /media/stash/* proxy (adds ApiKey, rewrites HLS), /media/play/:id direct file
  src/api.ts      /api routes (zod-validated)
  src/db/         Drizzle schema + migrations (drizzle/), migrate on boot
apps/web        Vite + React 19 + Tailwind 4 + TanStack Router/Query
packages/shared API contract types shared by both (types only at runtime on the server)
```

## Rules

1. **The browser never talks to Stash and never sees the API key.** All Stash URLs go
   through `mediaUrl()` → `/media/stash/...`. The proxy allowlists `/scene|performer|studio|tag|group/`.
2. **Stash owns ratings, play counts, resume points, O-counts, markers, performer/studio
   favourites, titles and tags** (so its UI stays consistent). Postgres holds only what Stash
   cannot: playlists (including the built-in Favorites list behind the heart on videos; Stash
   scenes have no favourite flag), the blocklist, pinned home rows, and settings (performer
   gender switch, per-studio intro skip, panic URL). Settings live next to the page they
   affect, not on the Settings page, unless they are global.
   Markers created in flix use the Stash tag "Highlight" (created on first use).
3. **The web app only knows `@flix/shared` types**, never Stash shapes, so the backend can
   be replaced piece by piece later.
4. **Blocklist** applies to every list, search, feed and related query unless `unblocked=1`.
   An id the query explicitly includes (a performer page, a tag filter) overrides its block.
5. Server code must be erasable TypeScript (`erasableSyntaxOnly`): no enums, namespaces or
   parameter properties; relative imports end in `.ts`; type-only imports use `import type`.
6. Page components that use `getRouteApi` declare `: JSX.Element` return types; without it the
   router's types go circular. Search reducers annotate `prev` (`(prev: SceneQuery) => …`).
7. `useEffect` callbacks must not return a value: Chrome's `window.scrollTo` returns a Promise,
   which React then calls as a cleanup and crashes.

## Run locally

```sh
pnpm install
pnpm db:up                       # Postgres 18 on 127.0.0.1:5433
cp .env.example .env             # fill STASH_API_KEY (same key as ~/code/nas/.env STASH_API_KEY)
pnpm dev                         # BFF :8080 + Vite :5173 (proxies /api and /media)
```

Checks: `pnpm typecheck`, `pnpm --filter @flix/web lint`, `docker build -t flix .`

## Caching (goal: Stash does only real work)

| Layer | Where | What | Freshness |
|---|---|---|---|
| Query results | memory (`cache/memory.ts`, `dataCache` in `stash.ts`) | every GraphQL read, keyed by query+variables | TTL `DATA_CACHE_TTL_MINUTES` (30), then served stale for up to 24 h while one background refresh runs; concurrent identical reads share one request |
| Assets | disk `CACHE_DIR/assets` (`cache/assets.ts`) | screenshots, preview clips, sprites, VTTs, performer/studio/tag images | TTL `ASSET_CACHE_TTL_HOURS` (168), then revalidated by ETag; stale copy served if Stash is down; 404s remembered 10 min; LRU under `ASSET_CACHE_MAX_MB` (5120) |
| Not cached | | `/scene/<id>/stream*` (direct and HLS), all writes | |

Invalidation:
- **flix's own writes** go through `mutate()`, which drops the tags they affect: `scene`, `scene:<id>`, `performer`, and so on.
- **Changes made in Stash** (scans, Identify, edits in its UI) are caught by a change check: one query every `CHANGE_POLL_SECONDS` (60), only while flix has been used in the last 10 minutes. It compares each type's count and newest `updated_at`; any difference clears the query cache. _Verified 2026-10-26:_ `sceneSaveActivity` does not bump `updated_at`, so progress saves while watching don't trigger it; `sceneUpdate` does.
- **Admin:** Settings → Cache shows hit rates and the requests actually sent to Stash, and has clear buttons (`GET /api/admin/cache`, `POST /api/admin/cache/clear {scope: data|assets|all}`).

_Measured 2026-10-26:_ a cold home view cost Stash 7 queries and 79 asset fetches; a warm view cost nothing.

## Playback

The client checks `canPlayType` for the file's container and codecs: if the browser can play
the file, it streams the original (`/media/play/:id`, byte ranges, from the NFS mount when
`MEDIA_PATH_MAP` resolves it, else Stash's direct stream). Otherwise it uses Stash's HLS
transcode (`stream.m3u8`, hls.js outside Safari), and also falls back to HLS on any media
error. _2026-10-26:_ 477/520 files are mp4/h264/aac; the other 43 (mkv hevc/h264-ac3, avi
mpeg4, wmv vc1, av1) transcode. The first HLS segment takes ~2.3 s.

## Status and next steps

See `docs/plan.md`.
