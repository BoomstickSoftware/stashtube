---
title: Kubernetes deployment (flix.lan)
kind: integration
summary: How flix runs on the Talos cluster — one Recreate pod in namespace flix, the image pinned by digest, its env and secrets, the cache PVC, MetalLB 192.168.1.152 with no Ingress, and the kubectl commands to look at it.
tags: [k8s, argocd, deploy, metallb, secrets]
status: current
verified: 2026-10-30
updated: 2026-10-30
sources: [k8s:docs/flix.md, k8s:infra/flix/deployment.yaml, k8s:infra/flix/storage.yaml]
related: [forgejo-ci, deploy-and-verify, config-env, postgres-cnpg, nfs-media, lan-only-no-ingress, k8s-clone-on-side-branch]
---

# Kubernetes deployment (flix.lan)

Manifests are plain YAML in the k8s repo, `infra/flix/`, applied by the ArgoCD app
`infra/apps/flix.yaml` (automated sync, prune, self-heal). The flix repo's CI commits the image
digest there ([[forgejo-ci]]). Read them with `git show origin/main:infra/flix/<file>`, because
the local clone may sit on a side branch ([[k8s-clone-on-side-branch]]).

| | |
|---|---|
| Namespace / app | `flix`, Deployment `flix`, 1 replica, `Recreate` (in-memory caches and an RWO cache PVC) |
| Image | `git.lan:3000/zbmowrey/flix:<sha>@sha256:…` from the Forgejo registry, pull secret `flix-registry` |
| Pod | `runAsNonRoot`, uid/gid 1000 (image user `node`), `nodeSelector` worker, `/healthz` probes |
| Address | MetalLB `192.168.1.152`, Service port 80 → 8080. `flix.lan` resolves only where a hosts file says so (the router answers `.lan` with SERVFAIL); any device can use the IP |
| Exposure | **No Ingress, no `*.zbmowrey.com` host**, nothing through the Cloudflare tunnel ([[lan-only-no-ingress]]). Remote use: Tailscale subnet route |
| Database | CNPG `flix` ([[postgres-cnpg]]) |
| Media | PV/PVC `flix-media`, NFS read-only at `/media/adult` ([[nfs-media]]) |
| Cache | PVC `flix-cache`, `local-path`, 20Gi at `/cache`; `ASSET_CACHE_MAX_MB=15360`. Disposable: losing it costs one refill |

## Environment

Set in the Deployment: `STASH_URL`, `DATABASE_URL`, `MEDIA_PATH_MAP=/data/adult=/media/adult`,
`CACHE_DIR=/cache`, `MEDIA_ORIGIN=http://192.168.1.152` (AirPlay receivers cannot resolve
`flix.lan`), `ASSET_CACHE_MAX_MB`, `WHISPARR_URL=http://192.168.0.10:6970`,
`WHISPARR_PATH_MAP=/data/adult=/volume1/Media/adult`. Meanings: [[config-env]].

## Secrets (manual, never in git)

`bash infra/flix/create-secrets.sh` in the k8s repo generates passwords, prompts for the
Forgejo PAT, prints nothing.

| Secret | Namespace | Keys |
|---|---|---|
| `flix-db-credentials` | `cnpg` + `flix` | `DB_PASSWORD` |
| `flix-app-secrets` | `flix` | `STASH_API_KEY`, `FLIX_SESSION_SECRET`, `WHISPARR_API_KEY` (enables Delete and Get), optional `FLIX_PASSWORD` |
| `flix-registry` | `flix` | dockerconfigjson, Forgejo PAT with `read:package` |

## Looking at it

```sh
kubectl -n flix get pods,svc,pvc
kubectl -n flix get deploy flix -o wide          # the running image commit
kubectl -n flix logs deploy/flix --since=5m      # `warming:` lines after a rollout
curl -s http://192.168.1.152/healthz             # {"ok":true,"version":"<sha>"}
curl -s http://192.168.1.152/readyz              # "ok" when Postgres answers
kubectl -n flix exec deploy/flix -- ls /media/adult
```

Since 2026-10-29 the CI waits for the rollout and smoke-tests it ([[deploy-and-verify]]).
