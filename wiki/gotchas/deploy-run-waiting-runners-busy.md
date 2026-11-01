---
title: The deploy run stays "waiting" for an hour (the runners are busy with another repo)
kind: gotcha
summary: A push queued a Forgejo run that sat in `waiting` for over an hour while all three runners served another repo back to back; flix was fine and deploy-check gave up after 10 min.
tags: [deploy, ci, forgejo, runner]
symptom: "tea actions runs shows the newest run waiting; deploy-check prints running <old sha> (wanted <new sha>, NOT deployed)"
found: 2026-11-01
status: current
verified: 2026-11-01
updated: 2026-11-01
code: [scripts/deploy-check.mjs, .forgejo/workflows/deploy.yml]
related: [deploy-and-verify, forgejo-ci, trivy-db-download-timed-out]
---

# The deploy run stays "waiting" for an hour (the runners are busy with another repo)

## Symptom

After `git push`, `node scripts/deploy-check.mjs` printed `running 9247fbd (wanted c842bab,
NOT deployed)` after its 10 min limit and then smoke-tested the old build (all 200, which says
nothing about the push). `tea actions runs` showed run 6474 `waiting`, with no workflow, branch
or start time, for over an hour (2026-11-01 02:50–03:50 UTC).

## Cause

The three `forgejo-runner-*` pods were all `Running` and healthy, but each was taking
`zbmowrey/tradesmanagerpro` tasks back to back (`kubectl -n forgejo-runner logs
forgejo-runner-0 -c runner --since=30m` showed only that repo's jobs). The flix job needs a
`docker-build` runner (all three carry `[ubuntu-latest ubuntu-22.04 docker docker-build]`)
and waits its turn; Forgejo does not interleave repos. At 04:30 UTC the other repo still had
**30 runs waiting** (`tea actions runs --repo zbmowrey/tradesmanagerpro | grep -c waiting`),
each of several ~10 min jobs, so the wait was hours, not minutes.

## Outcome

Run 6474 went `success` on its own once a runner freed up (checked later on 2026-11-01:
`tea actions runs` showed no waiting or running flix runs, `/healthz` reported c842bab and
`deploy-check --no-wait` passed all 9 smoke routes). The other repo still had 4 waiting and
2 running at that point, so flix simply got a turn between its jobs.

## Fix

Nothing to fix in flix: the run starts when a runner frees up. Run 6474 went live after
about 7 h (the user cleared it on the Forgejo side on 2026-11-01 morning); the deployed
build then passed `mini-check` against `http://flix.lan` directly, writes blocked. To tell this case from a
broken runner, read the runner logs; a busy runner logs `task <n> repo is <other repo>` every
few minutes, a dead one logs nothing. Cancelling the other repo's runs is the user's call.

## Avoid

Before a push whose deploy is wanted quickly, `tea actions runs` in the other repo (or the
runner logs) shows whether a queue is ahead. `deploy-check` can be re-run later with no
argument; a background poll of `/healthz` for the sha, then `deploy-check --no-wait`, is what
this session did. Runbook: [[deploy-and-verify]].
