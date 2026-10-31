---
title: Configuration (environment variables)
kind: architecture
summary: Every environment variable the BFF reads, its default, what it enables, and what the k8s Deployment sets.
tags: [config, env, server, k8s]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/server/src/config.ts, .env.example]
related: [dev-setup, kubernetes-deployment, caching, env-key-not-set-at-startup]
---

# Configuration (environment variables)

Parsed once in `apps/server/src/config.ts`. Required ones throw at startup
([[env-key-not-set-at-startup]]). `.env.example` lists them; the dev `.env` is gitignored and
read only by the server's `dev` script ([[dev-setup]]). Production values come from the k8s
Deployment and `flix-app-secrets` ([[kubernetes-deployment]]).

| Variable | Default | Effect | k8s |
|---|---|---|---|
| `STASH_URL` | required | Stash base URL | `http://192.168.0.10:9999` |
| `STASH_API_KEY` | required | sent as `ApiKey` on every Stash call; never reaches the browser | secret |
| `DATABASE_URL` | required | Postgres | `postgres://flix_user:…@postgres-rw.cnpg.svc.cluster.local:5432/flix` |
| `PORT` | 8080 | listen port | 8080 |
| `MEDIA_PATH_MAP` | unset (stream through Stash) | `stashPrefix=localPrefix[,…]`: direct-play originals from a local mount ([[media-proxy]]) | `/data/adult=/media/adult` |
| `MEDIA_ORIGIN` | unset (relative links) | absolute origin for playback links, for AirPlay | `http://192.168.1.152` |
| `FLIX_PASSWORD` | unset (no login) | enables the optional login ([[optional-login]]) | unset |
| `FLIX_SESSION_SECRET` | unset | required when `FLIX_PASSWORD` is set; also keys the signed media links | secret |
| `WHISPARR_URL`, `WHISPARR_API_KEY` | unset (no Delete, no shelf's Get) | both set → `/api/features` reports `deleteScenes` and `whisparr` true ([[whisparr-api]]) | `http://192.168.0.10:6970`, secret |
| `WHISPARR_PATH_MAP` | unset | Stash path → Whisparr path, like `MEDIA_PATH_MAP` | `/data/adult=/volume1/Media/adult` |
| `STASHDB_URL`, `STASHDB_API_KEY` | unset (read from Stash's stash-box config at first use) | override the StashDB endpoint and key ([[stashdb]]) | unset |
| `WEB_DIST` | unset (Vite serves the web in dev) | directory of the built web app to serve | `/app/web` (image) |
| `CACHE_DIR` | `<cwd>/.cache` | asset cache and `data.json` snapshot ([[caching]]) | `/cache` (PVC) |
| `ASSET_CACHE_MAX_MB` | 5120 | LRU bound of the asset cache | 15360 (20Gi PVC) |
| `ASSET_CACHE_TTL_HOURS` | 720 | after it, assets are revalidated by ETag | default |
| `WARM_AT_UTC` | 6 | hour to pre-fetch all artwork; empty disables | default |
| `DATA_CACHE_TTL_MINUTES` | 360 | query results fresh for this long | default |
| `DATA_CACHE_STALE_HOURS` | 168 | then served stale while refreshing, for up to this long | default |
| `DATA_CACHE_MAX_ENTRIES` | 5000 | query cache size | default |
| `CHANGE_POLL_SECONDS` | 60 | change check against Stash while in use; 0 disables | default |
| `FLIX_VERSION` | `dev` | reported by `/healthz`; set from `GIT_SHA` in the image | build arg |
| `NODE_ENV` | | `production` in the image | image |

Numeric values must be non-negative numbers or startup fails. Web-side: `FLIX_SERVER` is a
Vite dev-proxy target, not a BFF variable ([[prod-checks-read-only]]).
