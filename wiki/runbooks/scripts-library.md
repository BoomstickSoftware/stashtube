---
title: Use and grow the scripts library
kind: runbook
summary: The rule that an operations task is done by a registered script when one would do it well, how to find one (scripts/manifest.json via scripts.mjs), how to add one, and what the lint enforces.
tags: [scripts, meta, checks, deploy]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [scripts/manifest.json, scripts/scripts.mjs]
related: [run-checks, deploy-and-verify, mobile-checks, regenerate-stash-schema, gather-context]
---

# Use and grow the scripts library

Whenever a task needs doing (checking, deploying, verifying, regenerating, measuring,
gathering), look for a script first; if none fits and a script would do the job to a high
standard, write it, register it, then use it. The wiki holds what is known; `scripts/` holds
what can be done. Both are kept true the same way: use first, build on, correct when wrong.

## Steps

1. Find one:

```sh
node scripts/scripts.mjs search <words>     # ranked by name, tags, what it does, usage
node scripts/scripts.mjs list               # everything, incl. the nas repo's read-only tools
node scripts/scripts.mjs show <name>        # the full entry: usage, env, what it writes
```

   Expected: one or more entries with a usage line to copy. `search` exits 1 with a hint when
   nothing matches.

2. Use it as the usage line says. If it fails or falls short, fix the script, not the task by
   hand; then record the failure as a `gotchas/` page if it can recur.

3. Add one when none fits: `scripts/<verb-noun>.mjs` (Node, no dependencies beyond the
   workspace's, runs from any directory, header comment with usage and env), then an entry in
   `scripts/manifest.json` with every required key: `name`, `file`, `does` (one sentence),
   `usage` (copyable lines), `env` (optional), `writes` (what it touches; "nothing" when
   read-only), `tags`, `wiki` (the runbook or feature page that explains the task). A script
   that reaches Stash, Whisparr or the cluster is read-only unless the user asked for the write
   ([[prod-checks-read-only]]).

4. Mention the script in the wiki page that owns the task (its `code:` list and the step that
   uses it), then:

```sh
node scripts/scripts.mjs lint
```

   Expected: `ok: N scripts, M external`. It fails on a file in `scripts/` that is not
   registered, an entry whose file or `wiki` page does not exist, a duplicate name or a
   missing key.

## What is in it (2026-10-31)

| Script | Does |
|---|---|
| `check.mjs` | the pre-commit checks in order with the lint-warning baseline ([[run-checks]]) |
| `deploy-check.mjs` | waits for the pushed sha on `/healthz`, hits the smoke routes ([[deploy-and-verify]]) |
| `mobile-check.mjs`, `touch-check.mjs`, `card-check.mjs` | the headless phone checks ([[mobile-checks]]) |
| `stash-schema.mjs` | refreshes the Stash schema ([[regenerate-stash-schema]]) |
| `wiki.mjs` | wiki search, index, lint ([[CONVENTIONS]]) |
| `scripts.mjs` | this registry |

`external` listed the nas repo's `stash.py` and `arr.py` until 2026-11-02; they now live here as `scripts/stash.py` and `scripts/whisparr.py` ([[stash-and-whisparr-clients]]).
`pnpm` scripts (`typecheck`, `test`, `db:up`, …) stay in `package.json`; they are building
blocks, not operations.

## If it fails

- `lint` says a file is not registered: add the entry; do not delete the script to silence it.
- A script needs a key: it reads it from the env the user exports; never read `.env` to find
  it ([[env-key-not-set-at-startup]]).
