---
title: Work in verified, revertible steps: one commit and push per initiative
kind: decision
summary: Each initiative is batched into one commit with a plain imperative subject, verified (typecheck, lint, tests, a headless screenshot when UI changed) and pushed before the next starts; every push deploys.
tags: [workflow, git, deploy, process]
status: current
decided: 2026-10-29
by: user
verified: 2026-10-30
updated: 2026-10-30
related: [run-checks, deploy-and-verify, forgejo-ci, postgres-not-sqlite]
---

# Work in verified, revertible steps: one commit and push per initiative

**Decided** 2026-10-29 by the user ("proceed incrementally, one commit/push per initiative";
"use workflows and subagents as needed"). **Status** current.

## Context

The Round 4 review proposed many changes at once. The user weighs operational simplicity they
already have over theoretical wins ([[postgres-not-sqlite]]) and wants reviewable, revertible
steps.

## Decision

Related changes form one initiative, one commit, one push. Before the commit: `pnpm typecheck`,
`pnpm --filter @flix/web lint`, `pnpm test`, and a headless screenshot or check script where UI
changed ([[run-checks]], [[mobile-checks]]). Commit subjects are plain imperative, one line.
Then push, confirm the rollout ([[deploy-and-verify]]), and move on.

## Consequences

- Do not bundle unrelated initiatives in one commit; do not leave an initiative half-done.
- Every push to `main` goes live within minutes ([[forgejo-ci]]), so a push is a deploy.
- Delegating initiatives to forked subagents to keep context tight is welcome.
- Do not reopen settled architecture choices in passing; they have decision pages.

## Revisit if

The user asks for a different cadence or a staging branch.
