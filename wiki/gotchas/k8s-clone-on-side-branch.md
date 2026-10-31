---
title: The local k8s clone may sit on a side branch far behind main
kind: gotcha
summary: ~/code/k8s was on branch docs/argocd-admin-reset, 215 commits behind origin/main, on 2026-10-29; read flix's manifests with `git show origin/main:infra/flix/...` rather than from the working tree.
tags: [k8s, git, context]
symptom: "infra/flix manifests in ~/code/k8s show an old image or are missing"
found: 2026-10-29
status: current
verified: 2026-10-30
updated: 2026-10-30
related: [gather-context, kubernetes-deployment]
---

# The local k8s clone may sit on a side branch far behind main

## Symptom

Reading `~/code/k8s/infra/flix/deployment.yaml` showed an image digest from days earlier,
or files that `docs/flix.md` on the forge described were absent.

## Cause

The k8s repo's working tree is whatever branch the user last worked on. On 2026-10-29 it was
`docs/argocd-admin-reset`, 215 commits behind `origin/main`, while CI commits every flix
deploy to `main`.

## Fix

Read the deployed truth from the remote branch, never the checkout:

```sh
cd ~/code/k8s && git fetch -q origin && git show origin/main:infra/flix/deployment.yaml
git show origin/main:docs/flix.md
```

Do not switch the user's branch to look.

## Avoid

[[gather-context]] uses the `origin/main:` form for every k8s fact. The live state is
`kubectl -n flix get deploy flix -o wide` ([[kubernetes-deployment]]).
