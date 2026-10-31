---
title: Keep Stash as the headless backend
kind: decision
summary: Neither fork nor rewrite Stash; it stays on the NAS as the engine (scans, StashDB, generated assets, VAAPI transcodes) and flix is a new front end plus a small BFF.
tags: [architecture, stash, gpu, nas]
status: current
decided: 2026-10-26
by: user
verified: 2026-10-30
updated: 2026-10-30
related: [overview, stash-api, stash-owns-activity, roadmap]
sources: [k8s:docs/flix.md]
---

# Keep Stash as the headless backend

**Decided** 2026-10-26 by the user. **Status** current.

## Context

The user found Stash's UI clunky and wanted a polished tube-style site. Options were to fork
Stash, rewrite it, or build a front end over it. The k8s cluster has no usable GPU: the Proxmox
host's Ryzen 5 5600 has no iGPU, its RTX 3060 Ti is shared into the Plex LXC through the host
driver (passing it to a Talos VM would take it from Plex), and the workers are 2 vCPU each, too
weak for CPU generation.

## Decision

Stash stays on the NAS as a headless engine: it scans, fingerprints, scrapes StashDB, generates
sprites and previews, and hardware-transcodes on the N5105's iGPU (VAAPI). flix adds the UI and
only what Stash lacks ([[overview]]).

## Consequences

- flix is light and runs on the cluster; everything heavy stays where the GPU is.
- Stash's data model is the source of truth for activity ([[stash-owns-activity]]); flix talks
  to it only through `stash.ts` ([[stash-api]]).
- The Stash UI becomes the admin console only (scans, Identify, settings).
- Nothing in flix may require a Stash fork or patch.

## Revisit if

A GPU becomes available to the cluster, or Stash's SQLite locking ([[stash-database-locked]])
becomes the bottleneck; the standing "later" item is to decide whether to replace parts of
Stash's backend behind the BFF ([[roadmap]]).
