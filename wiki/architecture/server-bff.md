---
title: Server (BFF)
kind: architecture
summary: Module map of apps/server, how it runs (Node 26 executes .ts natively, erasable TypeScript), what the tests cover, and what /healthz and /readyz mean.
tags: [server, hono, node, tests]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [apps/server/src/index.ts, apps/server/src/api.ts, apps/server/src/stash.ts]
related: [stash-layer, caching, media-proxy, data-model, coding-conventions, run-checks]
---

# Server (BFF)

`apps/server` is a Hono app on Node 26, started as `node src/index.ts`: no build step, Node
runs the TypeScript directly, which is why the code must be erasable ([[coding-conventions]]).
One process serves `/api/*`, `/media/*` and, in production, the built web app (`WEB_DIST`).

## Module map (`apps/server/src/`)

| File | Holds |
|---|---|
| `index.ts` | App assembly, `/healthz`, `/readyz`, CORS for signed media, static web, migrate on boot |
| `guard.ts` | Cross-site writes, foreign host names, security headers, playback CORS origins ([[request-guard]]) |
| `sweep.ts` | Removes playlist items and station resume points whose scenes Stash no longer has ([[playlists-and-favorites]]) |
| `api.ts` | Every `/api` route, zod-validated |
| `stash.ts` | Every Stash GraphQL call and the Stash→flix mapping; nothing else knows Stash's schema ([[stash-layer]]) |
| `stash.schema.ts` | Generated from `stash.schema.graphql` (Stash v0.31.1); 5.5 k lines, never edited by hand ([[regenerate-stash-schema]]) |
| `media.ts` | `/media/stash/*` proxy, `/media/remote/:token` StashDB covers, `/media/play/:id` direct file ([[media-proxy]]) |
| `remote.ts` | The remote-cover allowlist (`stashdb.org`), the proxied URL the mappers hand out, the redirect-bounded fetch ([[media-proxy]]) |
| `signing.ts` | HMAC playback tokens `st=<expiry>.<hmac>`, 24 h, per scene; remote-cover tokens `<base64url(url)>.<hmac>`, no expiry |
| `files.ts` | Byte-range serving of files found through `MEDIA_PATH_MAP` |
| `cache/memory.ts`, `cache/assets.ts` | Query cache and disk asset cache, resized WebP copies with sharp (a native dependency; its Alpine build adds ~23 MB to the image) ([[caching]]) |
| `warm.ts` | Boot and nightly pre-fetch of artwork, home feed, facets, tiles |
| `admin.ts` | `GET /api/admin/cache`, `POST /api/admin/cache/clear` ([[cache-admin]]) |
| `featured.ts` | Pure ranking of the Featured row ([[featured-ranking]]) |
| `stashdb.ts` | StashDB `queryScenes` for a performer or studio ([[stashdb]]) |
| `whisparr.ts` | Whisparr movie list, states, single-scene Get and add ([[whisparr-api]]) |
| `delete.ts` | Delete a scene through Whisparr, then Stash ([[delete-via-whisparr]]) |
| `duplicates.ts` | Which copy of a phash group to keep ([[duplicates-workbench]]) |
| `previews.ts` | Per-station daily seed and bounded fan-out for `/api/stations/previews` |
| `stations.ts`, `playlists.ts`, `rows.ts`, `blocklist.ts`, `settings.ts` | Postgres-backed features ([[data-model]]) |
| `auth.ts` | Optional password login, rate limit, secure cookies ([[optional-login]]) |
| `config.ts` | Env parsing with defaults ([[config-env]]) |
| `db/schema.ts`, `db/index.ts`, `drizzle/` | Drizzle schema, client, migrations ([[database-migrations]]) |

## Health endpoints

- `GET /healthz` → `{ ok: true, version: <GIT_SHA> }`. The deploy waits for its commit here ([[forgejo-ci]]).
- `GET /readyz` → `ok` when Postgres answers, `503` otherwise. It does **not** probe Stash: a
  scan holds Stash's SQLite lock for minutes and must not take flix out of rotation; the caches
  cover it ([[stash-database-locked]]).

## Tests

`node:test` files beside the code (`src/**/*.test.ts`, no test dependencies); `pnpm test`, also
run during the image build. `test-env.ts` supplies the env `config.ts` needs; nothing reaches
Stash or Postgres. They cover the pure parts where a mistake would only show as a Stash 500 or a
silent miss: the filter builder's nesting (`stash.test.ts`), every finder's criterion keys
against the introspected schema (`finders.test.ts`), both caches, byte ranges, signed links,
featured scoring, duplicates ranking, previews fan-out, marker grouping, the exact Whisparr and
StashDB requests, and the shared-package import (`imports.test.ts`). 69 tests on 2026-10-30.
