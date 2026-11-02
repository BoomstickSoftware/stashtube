---
title: Gather context from the other systems
kind: runbook
summary: Where to look, and which read-only tools to use, when a question is about Stash, Whisparr, StashDB, the NAS, the cluster or the CI rather than this repo's code; and the rule for what to record here afterwards.
tags: [context, nas, k8s, stash, whisparr, tools]
status: current
verified: 2026-10-30
updated: 2026-11-02
related: [overview, stash-api, whisparr-api, stash-and-whisparr-clients, kubernetes-deployment, forgejo-ci, k8s-clone-on-side-branch]
---

# Gather context from the other systems

Search this wiki first (`node scripts/wiki.mjs search …`). When the fact is not here or needs
re-verifying, go to the owner below, read-only, and then record **only the flix-facing fact** in
the owning wiki page with a `sources:` pointer and a date.

## Where facts live

| About | Look in |
|---|---|
| Stash config, libraries, scans, Identify, its container | here since 2026-11-02: `private/wiki/integrations/stash-instance.md`, [[stash-api]], [[stash-library]], `scripts/stash.py` |
| Whisparr config, profiles, indexers, import problems, the monitoring incident | here since 2026-11-02: `private/wiki/integrations/whisparr-instance.md`, [[whisparr-api]], `private/wiki/gotchas/whisparr-matches-by-studio-and-date.md`, `private/wiki/gotchas/whisparr-bulk-search-stalls-imports.md`, `scripts/whisparr.py` |
| The media library policy (what may be monitored, where adult titles live) | `~/code/nas/CLAUDE.md`, "Media library policy" |
| The NFS export, NAS ports and addresses | `nas:docs/network.md`; here: [[nfs-media]] |
| The cluster side: manifests, secrets, CNPG, backups, MetalLB, Argo | `~/code/k8s/docs/flix.md`, `docs/cnpg.md`, `docs/nas-backups.md`, `infra/flix/`; here: [[kubernetes-deployment]], [[postgres-cnpg]] |
| The compose stack that runs Stash and Whisparr | `~/code/flotilla` (compose, pinned tags) |

## Read-only tools

```sh
# Stash GraphQL with the real key (schema introspection, reproduce a failing query)
scripts/stash.py q '{ __type(name:"TagFilterType"){ inputFields { name } } }'
scripts/stash.py status

# Whisparr: reads here; writes only for an operations task the user asked for, with --apply ([[stash-and-whisparr-clients]])
scripts/whisparr.py get movie --json | head -c 2000
scripts/whisparr.py get studio --json
scripts/whisparr.py get queue --json

# k8s manifests: always origin/main, the clone may be on a side branch
git -C ~/code/k8s show origin/main:infra/flix/deployment.yaml
kubectl -n flix get pods,svc,pvc; kubectl -n flix logs deploy/flix --since=10m

# the live app
curl -s http://192.168.1.152/healthz; curl -s http://flix.lan/api/features
ssh dtr 'showmount -e localhost | grep adult'
```

The Forgejo run page (repo → Actions) shows the last deploy and its smoke test
([[forgejo-ci]]).

## Rules

- Never read any `.env` file, `config.xml`, or Portainer `stack.env`; the scripts above hold
  the keys and never print them.
- Do not change the other systems from here. A Stash or Whisparr setting change is a nas-repo
  task; a manifest change is a k8s-repo task. Note the need in [[roadmap]] or the relevant page.
- When a verified number from another repo changes, update the page here that cites it and
  bump its `verified` date; keep the `sources:` pointer so the next check knows where to look.
