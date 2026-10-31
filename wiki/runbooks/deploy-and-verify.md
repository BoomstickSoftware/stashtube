---
title: Deploy and verify a change
kind: runbook
summary: What to do after pushing to main — follow the Forgejo run, confirm the running commit and the warm-up, hit the first-paint routes, and how to roll back.
tags: [deploy, k8s, verify, rollback]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [scripts/deploy-check.mjs]
related: [forgejo-ci, kubernetes-deployment, run-checks, caching, one-commit-per-initiative, scripts-library]
---

# Deploy and verify a change

Every push to `main` goes live within minutes ([[forgejo-ci]]). Push only after
[[run-checks]] pass and one initiative is complete ([[one-commit-per-initiative]]).

## Steps

1. `git push`. Open the run: Forgejo → `zbmowrey/flix` → Actions. The build step ends with
   `image: git.lan:3000/zbmowrey/flix:<sha>@sha256:…`; the smoke step with `running <sha>
   after N s` and `ok 200 <path>` for each route.
2. Confirm the cluster runs it, scripted ([[scripts-library]]):

```sh
node scripts/deploy-check.mjs            # waits (up to 10 min) for /healthz to report HEAD's sha,
                                         # prints the deployment's image, GETs the smoke routes
node scripts/deploy-check.mjs --no-wait  # what runs now
```

   Expected: `running <sha> (= <sha>) after N s`, `image …@sha256:…`, `ok 200` per route and
   `all 9 routes answered 200`; exit 1 on a failed route or the wrong sha. The same by hand:

```sh
kubectl -n flix get deploy flix -o wide                 # image tag = the pushed sha
curl -s http://192.168.1.152/healthz                    # {"ok":true,"version":"<sha>"}
kubectl -n flix logs deploy/flix --since=5m | grep -i warming   # only assets it could not fetch
```

3. Hit what the smoke test covers plus whatever the change touched, on `http://flix.lan`:
   Home, Browse (facets), a scene, performers, studios, tags, search. A change to anything
   shared (exclusions, the filter builder, caching) must be checked on **every** consumer, not
   only the edited routes ([[stash-filters-have-no-id-criterion]]).
4. Expect the first requests after a rollout to be slower: the query cache snapshot restores
   from `/cache/data.json`, but VOLATILE sets (facets, tiles, the featured pool) are rebuilt
   ([[caching]]).

## If the smoke test fails

The Discord forge channel names the phase. "Deployed but the smoke test failed" means the new
image is live and a route is broken: fix forward or roll back at once.

## Rollback

```sh
git revert <sha> && git push       # CI builds and deploys the previous code as a new image
```

Or, faster, in the k8s repo set the `image:` line of `infra/flix/deployment.yaml` back to the
previous `tag@digest` (the earlier CI commit has it) and push; ArgoCD rolls it out.

## Not yet known

- Whether ArgoCD's poll interval can be shortened for this app (today up to 3 min before the
  rollout starts).
