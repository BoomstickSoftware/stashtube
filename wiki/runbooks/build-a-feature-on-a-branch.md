---
title: Build a feature on a branch and squash-merge it
kind: runbook
summary: The steps for branch work in flix: branch from a clean main, push without deploying, open a Forgejo pull request with tea, squash-merge, verify the deploy, and revert if needed.
tags: [git, workflow, forgejo, deploy]
status: current
verified: 2026-11-10
updated: 2026-11-10
code: [.githooks/pre-push, .forgejo/workflows/deploy.yml]
related: [reels-branch-and-squash-merge, one-commit-per-initiative, deploy-and-verify, run-checks]
---

# Build a feature on a branch and squash-merge it

Used for reels ([[reels-branch-and-squash-merge]]). Everyday work still goes to `main`.

## Start

```sh
git checkout main && git pull --ff-only && git status --short   # clean, level with origin
git checkout -b reels/m1-app
```

## While working

- Commit as often as is useful; these commits disappear in the squash.
- `git push -u origin <branch>` runs the pre-push checks and does **not** deploy.
- Keep up with `main`: `git fetch origin && git rebase origin/main` (then
  `git push --force-with-lease`), so the pull request shows only the feature.

## Merge

```sh
tea pr create --base main --head <branch> --title "<plain imperative subject>"
tea pr merge --style squash <number>       # one commit on main
git checkout main && git pull --ff-only
node scripts/deploy-check.mjs              # the merge is a deploy
git branch -d <branch> && git push origin --delete <branch>
```

The squash commit's subject is the milestone in the imperative, one line, as on `main` today.

## Take it back

```sh
git revert <squash sha> && git push origin main && node scripts/deploy-check.mjs
```

A reverted milestone leaves its tables in Postgres; they are additive and unused.

## Verified

2026-11-10: the branch `reels` was created from a clean `main` and pushed; the deploy workflow
did not run. The `tea pr` commands are from `tea` 0.14.2's help and have not been run here yet.
