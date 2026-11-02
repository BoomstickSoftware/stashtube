---
title: Regenerate the Stash schema types
kind: runbook
summary: After a Stash upgrade, refresh stash.schema.graphql from the running Stash (or a saved introspection) and regenerate stash.schema.ts, then run the finder tests and commit both files.
tags: [stash, codegen, graphql, upgrade]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [scripts/stash-schema.mjs, apps/server/codegen.ts, apps/server/stash.schema.graphql, apps/server/src/stash.schema.ts]
related: [stash-layer, stash-api, run-checks, gather-context]
---

# Regenerate the Stash schema types

Use after Stash is upgraded on the NAS (the flotilla stack pins `stashapp/stash:v0.31.1` on
2026-10-30). The types in [[stash-layer]] come from Stash's own schema and must match it.

## Steps

1. Fetch the schema, either from the running Stash with the key in the shell:

```sh
STASH_URL=http://192.168.0.10:9999 STASH_API_KEY=… pnpm --filter @flix/server schema
```

   or from a saved introspection result when the key is not in this shell (the `data` object of
   the standard introspection query, which `scripts/stash.py` can print):

```sh
pnpm --filter @flix/server schema path/to/introspection.json
```

   Both write `apps/server/stash.schema.graphql`.

2. Generate the TypeScript:

```sh
pnpm --filter @flix/server codegen       # graphql-codegen → src/stash.schema.ts
pnpm typecheck && pnpm test              # finders.test.ts checks every criterion against the new schema
```

3. Read the diff of `stash.schema.graphql` for removed or renamed criteria and fields flix
   selects, fix `stash.ts`, and commit **both** files with the code change.

## If it fails

- Typecheck errors in filter inputs: Stash dropped or renamed a criterion; change the query, do
  not cast.
- `schema` cannot reach Stash: the key is wrong or Stash is mid-scan; use the saved
  introspection form.
