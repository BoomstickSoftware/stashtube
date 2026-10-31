---
title: Change the Postgres schema
kind: runbook
summary: Edit the Drizzle schema, generate a migration into apps/server/drizzle, and let the BFF apply it on boot in dev and in production.
tags: [postgres, drizzle, migrations, schema]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/server/src/db/schema.ts, apps/server/drizzle.config.ts, apps/server/drizzle]
related: [data-model, postgres-cnpg, dev-setup]
---

# Change the Postgres schema

Tables and their meaning: [[data-model]]. Five migrations exist on 2026-10-30
(`0000_…` to `0004_…`).

## Steps

1. Edit `apps/server/src/db/schema.ts` (Drizzle, `pgTable`). Keep the comment that says what
   Stash owns instead; do not add a table for anything Stash can hold ([[stash-owns-activity]]).
2. Generate the migration:

```sh
pnpm db:generate            # = pnpm --filter @flix/server db:generate → drizzle-kit generate
```

   It writes `apps/server/drizzle/<n>_<name>.sql` and updates `drizzle/meta/`. Read the SQL.
3. Restart the dev BFF (`pnpm dev` watches; or restart it): migrations run on boot against the
   dev Postgres ([[dev-setup]]). Check the table exists: `docker exec flix-db-1 psql -U flix -c '\dt'`.
4. Commit the schema change, the migration and the code that uses it together. In production the
   new pod applies it on boot ([[postgres-cnpg]]); a migration that fails keeps the pod from
   starting, which the deploy's health wait reports ([[deploy-and-verify]]).

## Rules

- Migrations are append-only; never edit a shipped one.
- Scene ids are Stash ids stored as `text`.
- A new preference that is global and shared across devices goes in `settings` as jsonb, not a
  new table ([[settings-next-to-page]]).
