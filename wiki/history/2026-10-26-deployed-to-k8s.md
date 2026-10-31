---
title: "2026-10-26: Deployed to k8s as flix.lan"
kind: history
summary: Phase 3: the Forgejo deploy workflow (build, trivy, push, digest bump in the k8s repo, ArgoCD rollout) and the manifests behind flix.lan; the rollout wait and smoke test were added 2026-10-29.
tags: [history, deploy, k8s, ci]
date: 2026-10-26
commits: [c5f355c]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [kubernetes-deployment, forgejo-ci, deploy-and-verify]
---

# 2026-10-26: Deployed to k8s as flix.lan

## What changed

- `.forgejo/workflows/deploy.yml`: a push to `main` builds the image, scans it with trivy,
  pushes it to the Forgejo registry and commits the tag@digest into
  `infra/flix/deployment.yaml` in the k8s repo; ArgoCD (automated, prune, self-heal) rolls it
  out ([[forgejo-ci]]).
- Manifests in the k8s repo: namespace, CNPG database, Deployment (1 replica, `/healthz`
  probes), Service, `flix-app-secrets` and `flix-db-credentials` from `create-secrets.sh`, the
  read-only NFS PV of `/volume1/Media/adult` at `/media/adult`, a `local-path` cache PVC
  ([[kubernetes-deployment]], [[nfs-media]], [[postgres-cnpg]]).
- NAS side (owned by the nas repo): the read-only export of `Media/adult` to the three
  workers 192.168.1.134–136, added the same day.
- **2026-10-29** (c5f355c): the workflow waits until `/healthz` on 192.168.1.152 reports the
  build's commit as `version`, then smoke-tests the first-paint routes; either phase failing
  posts to the forge Discord channel.

## How it was verified

`kubectl -n flix get deploy flix -o wide` shows the image commit after a push; the pod log
says `warming:` on anything the boot warm could not fetch. Since 2026-10-29 the workflow
itself proves the rollout ([[deploy-and-verify]]).

## Snags

- flix.lan resolves only through hosts files (no LAN DNS), and AirPlay receivers cannot use
  it, so playback links are absolute to the IP (`MEDIA_ORIGIN`); see [[kubernetes-deployment]].
- The local k8s clone can be on a side branch ([[k8s-clone-on-side-branch]]).
