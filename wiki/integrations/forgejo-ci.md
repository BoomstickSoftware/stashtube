---
title: Forgejo CI (deploy.yml)
kind: integration
summary: Every push to main builds, trivy-scans and pushes the image, pins its digest into the k8s repo, waits for the rollout and smoke-tests the first-paint routes, posting failures to Discord.
tags: [ci, forgejo, trivy, deploy, docker]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [.forgejo/workflows/deploy.yml, .trivyignore.yaml, Dockerfile]
related: [deploy-and-verify, kubernetes-deployment, server-bff, shared-package-missing-from-image]
---

# Forgejo CI (`deploy.yml`)

`.forgejo/workflows/deploy.yml` runs on the cluster's Forgejo runner (`runs-on: docker-build`)
on every push to `main` and on `workflow_dispatch`, concurrency group `flix-deploy` (runs
queue, none is cancelled). **Every push goes live.** Source of the pattern: the kataroom app.

## Step 1: build, scan, push, bump k8s (`id: build`)

1. Clone `zbmowrey/flix` from `git.lan:3000` with `CI_TOKEN` (write:repository, write:package)
   and check out the pushed SHA.
2. `docker build --pull --build-arg GIT_SHA=$SHA`; the Dockerfile runs `typecheck` and
   `pnpm test` for the server and builds the web; `/healthz` reports `GIT_SHA` as `version`.
3. Scan **before** pushing with `aquasec/trivy:0.71.1`, `--severity CRITICAL,HIGH
   --ignore-unfixed --exit-code 1`, using `.trivyignore.yaml`. That file is a risk register, not
   a mute button: each entry must say why it is not exploitable and carry `expired_at`. Empty on
   2026-10-30.
4. Push `git.lan:3000/zbmowrey/flix:$SHA`, read its `sha256:` digest (refuse to continue
   without one), clone the k8s repo and `sed` the `image:` line of `infra/flix/deployment.yaml`
   to `tag@digest`, commit as `forgejo-actions` and push. ArgoCD picks it up on its next poll
   (up to 3 min). Pinning by digest means re-pushing a tag changes nothing.

## Step 2: wait and smoke-test (`id: smoke`, since 2026-10-29)

- Poll `http://192.168.1.152/healthz` every 5 s until it reports `"version":"$SHA"`, up to 8
  min (a rollout took under 2 min on 2026-10-29). The LAN IP is used because job containers sit
  on dind's bridge with public DNS: `.lan` names do not resolve there (the trivy step needs
  `--add-host=git.lan:192.168.1.151` for the same reason), but the IP routes and flix answers
  without a Host header.
- Then `GET` the routes behind every page's first paint and fail on any non-200: `/readyz`,
  `/`, `/api/home`, `/api/tags/tiles`, `/api/tags?perPage=3`, `/api/search?q=a`,
  `/api/scenes/facets`, `/api/performers?perPage=3`, `/api/studios?perPage=3`. A `401` on an
  `/api` route (if `FLIX_PASSWORD` is ever set) is reported as `lock`, not failed, until the step
  learns to log in.

## Step 3: notify on failure

Posts to the forge Discord channel through `DISCORD_FORGE_WEBHOOK`, naming the phase: build/scan
/push/tag-bump failed (not deployed), or deployed but the smoke test failed (a route is broken
or the rollout never came up). Silent when the secret is unset.

## Reading a run

Forgejo → repo → Actions → the run; the build step logs `image: …@sha256:…`, the smoke step
`running <sha> after N s` then `ok 200 <path>` per route. Operator steps: [[deploy-and-verify]].
