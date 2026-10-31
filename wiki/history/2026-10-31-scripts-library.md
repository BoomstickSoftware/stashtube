---
title: "2026-10-31: Scripts library and manifest"
kind: history
summary: The scripts directory became a registered library (manifest, search, lint) with the checks and the post-push verification scripted; CLAUDE.md gained the rule to use a script first and write one when none fits.
tags: [scripts, meta, checks, deploy]
status: record
date: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
related: [scripts-library, run-checks, deploy-and-verify, 2026-10-30-wiki-created]
---

# 2026-10-31: Scripts library and manifest

## What changed

- The user set the rule: when a task needs doing and a script would do it well, write the
  script, register it, and use it next time; rely on the library first, build on it, correct
  it over time, as with the wiki. `CLAUDE.md` got the section "Scripts are the hands";
  [[scripts-library]] is the runbook.
- `scripts/manifest.json` lists every script (name, file, does, usage, env, writes, tags, wiki)
  plus the nas repo's `stash.py` and `arr.py` as read-only externals. `scripts/scripts.mjs`
  does `list`, `search`, `show`, `lint`.
- `scripts/check.mjs` runs the pre-commit checks in order with a lint-warning baseline of 5
  ([[run-checks]]); `scripts/deploy-check.mjs` waits for the pushed sha on `/healthz` and hits
  the nine smoke routes ([[deploy-and-verify]]). Both are read-only.
- The wiki migration of 2026-10-30 ([[2026-10-30-wiki-created]]) was committed in the same
  commit; it had been left uncommitted in the working tree.

## How it was verified

`node scripts/scripts.mjs lint` → `ok: 8 scripts, 2 external`; `node scripts/check.mjs` →
all four checks pass (80 tests); `node scripts/wiki.mjs lint` clean. `deploy-check.mjs` ran
after the next push ([[2026-10-31-shelf-grid-view]]): waited 8 min 16 s, nine routes at 200.

## Snags

- oxlint prints no "Found N warnings" summary outside a terminal; `check.mjs` counts the
  per-finding `warning` lines instead.
- `scripts.mjs lint` checks `wiki:` slugs against file names, so the conventions page is
  referenced as `CONVENTIONS`, not `wiki-conventions`.
