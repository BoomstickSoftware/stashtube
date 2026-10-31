---
title: Keep Postgres for flix's own data
kind: decision
summary: flix's playlists, blocklist, rows, stations and settings stay in Postgres (CNPG in production); do not re-propose SQLite.
tags: [database, postgres, architecture]
status: current
decided: 2026-10-29
by: user
verified: 2026-10-30
updated: 2026-10-30
related: [data-model, postgres-cnpg, one-commit-per-initiative]
---

# Keep Postgres for flix's own data

**Decided** 2026-10-29 by the user. **Status** current.

## Context

The Round 4 review proposed replacing Postgres with SQLite for flix's few small tables
([[data-model]]), to drop a dependency.

## Decision

Postgres stays. The user: "already set up and working fine, no performance issues". In
production it is the `flix` database of the shared CNPG cluster, with its backups
([[postgres-cnpg]]); in development a local container on port 5433 ([[dev-setup]]).

## Consequences

- Drizzle schema and migrations target Postgres; migrations run on boot.
- Do not raise SQLite, embedded databases or "one fewer moving part" again.
- Operational simplicity the user already has outranks theoretical wins; see
  [[one-commit-per-initiative]] for the same spirit.

## Revisit if

The CNPG cluster goes away or flix needs to run somewhere without Postgres.
