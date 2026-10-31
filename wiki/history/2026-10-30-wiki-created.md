---
title: "2026-10-30: Wiki created, CLAUDE.md and plan.md migrated"
kind: history
date: 2026-10-30
summary: The 25 KB CLAUDE.md and docs/plan.md were split into a Karpathy-style wiki of small pages with frontmatter, a generated index, a log and tooling; CLAUDE.md became the schema.
tags: [wiki, meta, docs]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [CONVENTIONS, roadmap]
---

# 2026-10-30: Wiki created, CLAUDE.md and plan.md migrated

## What changed

- `wiki/` created with seven kind directories (`architecture`, `features`, `integrations`,
  `decisions`, `runbooks`, `gotchas`, `history`) plus `CONVENTIONS`, `index`, `log` and `roadmap`.
  [[CONVENTIONS]] holds the frontmatter schema, body templates, naming and the sharding rule
  (one page, one question, under 120 body lines).
- `scripts/wiki.mjs` added: `search` (ranked over title, tags, symptom, summary, body), `index`
  (generates `index.md` from frontmatter), `lint` (required keys, kinds, dates, duplicate slugs,
  broken `[[links]]`, orphans, body length, stale `verified`, stale index, log format), `tags`,
  `stale`, `show`.
- The former `CLAUDE.md` (Layout, Rules, Run locally, Deploy, Caching, Featured, Whisparr and
  StashDB, Duplicates, Playback, Privacy) was split into architecture, feature, integration and
  runbook pages. `docs/plan.md` became one history page per round and [[roadmap]]; the file was
  removed (git history keeps it).
- flix-facing facts that lived only in other places were pulled in: the Stash and Whisparr API
  rows of `nas:docs/services.md`, the single-scene Whisparr path from `nas:docs/known-issues.md`
  #40, the deployment facts of `k8s:docs/flix.md` and `k8s:infra/flix/`, and the agent's memory
  notes (dev environment, decisions, the tag outage).
- `CLAUDE.md` rewritten as the schema: purpose and repo map, search-first and update-after rules,
  a table of where to gather context from other systems, the eleven rules that must be in every
  session, a quick reference.

## How it was verified

`node scripts/wiki.mjs index && node scripts/wiki.mjs lint` clean (no errors) over every page;
spot checks of `search` for an error string, a feature name and an env var each returned the owning
page first.

## Snags

- Links inside fenced or inline code in `CONVENTIONS` were counted as broken until the lint
  learned to strip code spans.
