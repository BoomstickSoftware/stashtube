---
title: Reels is built on feature branches and squash-merged by pull request
kind: decision
summary: Unlike day-to-day work, which commits to main, reels is developed on a branch per milestone and lands as one squashed commit each, so a milestone can be reverted whole.
tags: [reels, git, workflow, process]
status: current
decided: 2026-11-10
by: user
verified: 2026-11-10
updated: 2026-11-10
related: [one-commit-per-initiative, reels-engineering-roadmap, build-a-feature-on-a-branch, forgejo-ci]
---

# Reels is built on feature branches and squash-merged by pull request

**Decided** 2026-11-10 by the user ("a feature branch for build out; when we PR and merge, we'll
squash the merge so it's a single commit and becomes easy to revert"). **Status** current.

## Context

Small initiatives go straight to `main`, one commit each ([[one-commit-per-initiative]]), and
every push to `main` deploys. Reels is weeks of work across three repos; half of it on `main`
would be live.

## Decision

Reels work happens on a branch (`reels` first, then `reels/m<n>-<topic>`), is proposed as a
pull request on Forgejo and merged with **squash**. One commit per milestone lands on `main`.
The agent's choice within that, open to the user: one pull request per milestone rather than one
for the whole feature, so each stays reviewable and `main` gets the pieces that are ready.

## Consequences

- This extends [[one-commit-per-initiative]], it does not replace it: a milestone is the
  initiative, the branch is where its drafts live.
- A branch push does not deploy (the workflow runs on `main` only), and until M0 adds a
  pull-request check, nothing but the pre-push hook checks a branch.
- Reverting a milestone is `git revert <sha>` on `main`; its tables stay, empty and unused.
- Steps: [[build-a-feature-on-a-branch]]. Plan: [[reels-engineering-roadmap]].
