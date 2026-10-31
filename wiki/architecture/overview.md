---
title: Architecture overview
kind: architecture
summary: flix is a React web app plus a small Hono BFF in front of a headless Stash on the NAS; which repo owns what, and the one-user LAN-only scope.
tags: [architecture, repos, scope]
status: current
verified: 2026-10-30
updated: 2026-10-30
related: [stash-stays-headless, server-bff, web-app, kubernetes-deployment, gather-context]
---

# Architecture overview

flix is a tube-style front end for the adult library on the NAS. **Stash is the headless
backend**: it scans, fingerprints, scrapes StashDB, generates sprites and previews, and
hardware-transcodes (VAAPI on the NAS's N5105). flix adds the UI and what Stash lacks:
playlists, a global blocklist, a home feed, related videos, stations. Single user, LAN only
([[single-user-no-login]], [[lan-only-no-ingress]]).

## Three layers

| Layer | Where it runs | Page |
|---|---|---|
| Stash (data, generated assets, transcodes) | NAS, `http://192.168.0.10:9999`, a container in the flotilla stack | [[stash-api]], [[stash-library]] |
| BFF: Hono on Node 26, serves `/api`, `/media` and the built web app | one pod on the k8s cluster, `flix.lan` / 192.168.1.152 | [[server-bff]], [[kubernetes-deployment]] |
| Web: Vite + React 19 + Tailwind 4 + TanStack Router/Query | the browser (mostly an iPhone) | [[web-app]], [[mobile-first-ui]] |

The browser never talks to Stash ([[media-proxy]]). The web app knows only the types in
[[shared-contract]]. Postgres holds only what Stash cannot ([[data-model]],
[[stash-owns-activity]]). Everything Stash answers is cached so it does only real work
([[caching]]).

## Repos

| Repo | Owns |
|---|---|
| `~/code/flix` (this) | flix code, Dockerfile, CI workflow, this wiki |
| `~/code/nas` | Stash's config and the NAS side: the NFS export flix reads, Stash and Whisparr API facts, the media library policy |
| `~/code/flotilla` | The compose stack that runs Stash and Whisparr (deployed via Portainer) |
| `~/code/k8s` | Where flix runs: `infra/flix/` (namespace, Deployment, Service, PV/PVC, secrets script), the CNPG database, ArgoCD |

Record only the flix-facing fact of another system here and link the owning repo
([[gather-context]]).

## Why it has this shape

The cluster has no usable GPU, so generation and transcoding stay on the NAS and flix itself
is light: [[stash-stays-headless]]. Whisparr owns the files and Stash mounts them read-only,
so deleting goes through Whisparr ([[delete-via-whisparr]]) and on-demand downloads go
StashDB → Whisparr ([[whisparr-shelf]]).
