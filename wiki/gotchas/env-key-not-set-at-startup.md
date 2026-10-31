---
title: The BFF exits at startup with "STASH_API_KEY is not set"
kind: gotcha
summary: Only the server's dev script reads the repo-root .env; without it (or with `pnpm start`) config.ts throws at startup, and the key is filled in by hand, never copied from another repo's .env.
tags: [dev, config, secrets]
symptom: "Error: STASH_API_KEY is not set"
found: 2026-10-30
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/server/src/config.ts, apps/server/package.json, .env.example]
related: [dev-setup, config-env]
---

# The BFF exits at startup with "STASH_API_KEY is not set"

## Symptom

`pnpm dev` starts Vite but the server process dies at once with
`Error: STASH_API_KEY is not set` (or the same for `STASH_URL` or `DATABASE_URL`).

## Cause

`config.ts` requires those three variables. The only thing that loads `.env` is the server's
`dev` script (`node --watch --env-file-if-exists=../../.env`). `.env` is gitignored, so a
fresh clone has none, and `pnpm start` never reads it: production gets its variables from the
pod's environment ([[kubernetes-deployment]]).

## Fix

```sh
cp .env.example .env    # then fill STASH_API_KEY by hand
```

For `pnpm start`, export the variables in the shell first.

## Avoid

Never copy the key from another repo's `.env` (the nas repo's holds the same key); the
session's permission classifier blocks it, and the user fills it in themselves. Every
variable and default is listed in [[config-env]]; the setup steps in [[dev-setup]].
