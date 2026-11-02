---
title: Stash answers "database is locked" while a scan writes
kind: gotcha
summary: Stash's SQLite rejects reads with "database is locked" while a scan or Identify writes, so assets 404 and queries fail; flix retries with backoff and serves stale copies.
tags: [stash, sqlite, caching, resilience]
symptom: "database is locked (Stash); generated assets answer 404 during a scan"
found: 2026-10-26
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/server/src/cache/assets.ts, apps/server/src/stash.ts]
related: [caching, stash-api, whisparr-api]
---

# Stash answers "database is locked" while a scan writes

## Symptom

During a Stash scan, generate or Identify, GraphQL reads fail with `database is locked` and
generated assets (screenshots, previews, sprites) answer 404. Pages that are not cached go
blank or slow.

## Cause

Stash keeps its data in a single SQLite file (WAL mode) on the NAS array. A writing job
holds the lock; reads that arrive meanwhile are rejected. Every Whisparr import queues a scan
and an Identify through its Stash connection, so a bulk import builds a long queue of writers
(70 jobs on 2026-10-26, ~50 min for 102 jobs on 2026-10-29).

## Fix

- "database is locked" reads are retried with backoff (5face11, 2026-10-26).
- A cached asset is served stale when Stash is down or answers 404; first-time 404s are
  remembered for only one minute and retried (25fd7e1).
- `/readyz` probes Postgres, not Stash, so a scan does not take flix out of rotation.

## Avoid

Expect it after any import. When checking whether a Stash query works, look at the Stash
job queue first (Stash UI, or `scripts/stash.py jobs`). Details on the cache's
behaviour in [[caching]]; the NAS-side facts live in the nas repo (`nas:docs/services.md`).
