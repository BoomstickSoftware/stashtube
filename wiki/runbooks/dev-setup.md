---
title: Set up and run flix locally
kind: runbook
summary: Install, start the dev Postgres, fill .env by hand, run the BFF on 8080 and Vite on 5174, or point Vite at production read-only for the check scripts.
tags: [dev, setup, pnpm, env]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [package.json, .env.example, docker-compose.dev.yml, apps/server/package.json]
related: [config-env, postgres-cnpg, run-checks, mobile-checks, port-5173-taken, env-key-not-set-at-startup, prod-checks-read-only]
---

# Set up and run flix locally

Use when starting work on this Mac. Needs Node 26, pnpm 11.12 (`packageManager` in
`package.json`) and Docker (OrbStack) for the dev database.

## Steps

```sh
cd ~/code/flix
pnpm install
pnpm db:up                      # Postgres 18 on 127.0.0.1:5433, container flix-db-1
cp .env.example .env            # then fill STASH_API_KEY by hand
pnpm dev                        # BFF :8080 (node --watch) + Vite
```

- `.env` is gitignored and read only by the server's `dev` script
  (`--env-file-if-exists=../../.env`); `pnpm start` expects the variables exported. **There is
  no checked-in copy of the key anywhere; the user fills it by hand, never copied from another
  repo's `.env`** (the same key as the nas repo's `STASH_API_KEY`, but do not read that file).
  Without it the BFF exits at startup ([[env-key-not-set-at-startup]]).
- Vite: port 5173 is held by another project's OrbStack container, so Vite moves to 5174. Run it
  with `--port 5174 --strictPort` so the check scripts hit the right one ([[port-5173-taken]]):

```sh
pnpm --filter @flix/web exec vite --port 5174 --strictPort
```

- Optional variables (`WHISPARR_*`, `STASHDB_*`, `MEDIA_PATH_MAP`) are explained in
  [[config-env]]; without them the matching features are off and the UI hides them.
- Expected: `http://localhost:5174` shows Home within a few seconds; the BFF log prints
  `warming:` only for assets it could not fetch.

## Without a local BFF

```sh
FLIX_SERVER=http://flix.lan pnpm --filter @flix/web exec vite --port 5174 --strictPort
```

drives the UI against production. **Use it only with the check scripts, which block every
write; never for clicking through by hand** ([[prod-checks-read-only]]).

## If it fails

- `STASH_API_KEY is not set`: [[env-key-not-set-at-startup]].
- `No QueryClient set` after changing a dependency: [[vite-duplicate-react-query]].
- Port in use: [[port-5173-taken]].
- Postgres connection refused: `docker ps | grep flix-db`; `pnpm db:up` again.
