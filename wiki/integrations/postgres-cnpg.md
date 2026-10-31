---
title: Postgres (CNPG in production, Docker in dev)
kind: integration
summary: Where flix's Postgres data lives in production (the flix database of the shared CNPG cluster), how it is backed up, and the local Postgres 18 used for development.
tags: [postgres, cnpg, backups, dev]
status: current
verified: 2026-10-30
updated: 2026-10-30
sources: [k8s:docs/cnpg.md, k8s:docs/nas-backups.md, k8s:docs/flix.md]
code: [docker-compose.dev.yml, apps/server/src/db/index.ts]
related: [data-model, database-migrations, postgres-not-sqlite, kubernetes-deployment]
---

# Postgres (CNPG in production, Docker in dev)

flix's own data ([[data-model]]) is small: 8 MB on 2026-10-30. Ratings, play counts, O-counts
and markers are Stash's and follow Stash's backups on the NAS.

## Production

- Database `flix`, role `flix_user`, in the shared CloudNativePG cluster `postgres` (namespace
  `cnpg`), not a PVC of its own. `DATABASE_URL` is
  `postgres://flix_user:$(DB_PASSWORD)@postgres-rw.cnpg.svc.cluster.local:5432/flix`; the
  password is `flix-db-credentials` in both `cnpg` and `flix` namespaces
  ([[kubernetes-deployment]]).
- Created by the init job `infra/cnpg/cluster/init-flix-database.yaml` in the k8s repo.
- Migrations run on boot ([[database-migrations]]).

## Backups (verified 2026-10-30, owned by the k8s repo)

| When (UTC) | What |
|---|---|
| 03:00 | base backup of the whole cluster, plus continuous WAL archiving to MinIO (30-day retention) |
| 03:40 | mirror to the NAS `K8sBackups/cnpg/` by the `cnpg-nas-mirror` CronJob (namespace `nas-backups`) |
| 10:30 | shipped to S3 |

Restore procedure: k8s repo `docs/cnpg.md` and `docs/nas-backups.md`.

**Known problem (k8s repo's to fix):** the NAS mirror has been OOMKilled at 512Mi since
2026-10-28, because the base backup grew from 129 MB to ~1 GB when the Servarr databases moved
into CNPG on 2026-10-26. Fix is a memory bump in `infra/nas-backups/cronjob-cnpg-mirror.yaml`
(same failure and fix as 2026-07-10, 256→512Mi). Until then the MinIO copy is the only one.

## Development

`pnpm db:up` starts `docker-compose.dev.yml`: Postgres 18 (`postgres:18.0-alpine`) on
`127.0.0.1:5433`, user/password/db `flix` (dev-only, not a secret), volume `flix-db`,
container `flix-db-1`. `.env.example` points `DATABASE_URL` at it. Station test runs write
`station_resume` rows there; clear them afterwards ([[mobile-checks]]).

## Why Postgres

[[postgres-not-sqlite]]: it is set up, working, and not to be re-proposed.
