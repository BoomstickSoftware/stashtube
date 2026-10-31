---
title: Roadmap
kind: hub
summary: Where flix stands, what is left on the backlog, what is deferred, the known gaps and the open questions; done work is linked to its history page rather than listed.
tags: [roadmap, backlog]
status: current
verified: 2026-10-30
updated: 2026-10-31
related: [overview, log]
---

# Roadmap

## Status

flix is deployed and in daily use at http://flix.lan (192.168.1.152) since 2026-10-26, on the
k8s cluster with Stash as the headless backend on the NAS ([[stash-stays-headless]],
[[kubernetes-deployment]]). The Stash UI is the admin console only (scans, Identify,
settings). Every push to `main` goes live ([[deploy-and-verify]]).

Done, by date (each page says what changed and how it was verified):

- [[2026-10-26-spike-and-mvp]], [[2026-10-26-caching-and-ux-round-1]], [[2026-10-26-deployed-to-k8s]]
- [[2026-10-27-mobile-and-speed-round]]
- [[2026-10-28-round-2]]
- [[2026-10-29-round-3]], [[2026-10-29-round-4-review]], [[2026-10-29-typed-stash-layer-and-tag-outage]]
- [[2026-10-30-featured-ranking]], [[2026-10-30-markers-previews-api-split]],
  [[2026-10-30-whisparr-and-stashdb]], [[2026-10-30-duplicates-workbench]],
  [[2026-10-30-privacy-layers]], [[2026-10-30-mini-player]],
  [[2026-10-30-hold-to-mark-and-moments]], [[2026-10-30-wiki-created]],
  [[2026-10-30-relative-scrubbing]], [[2026-10-30-app-follows-deploys]]
- [[2026-10-31-review-round]], [[2026-10-31-home-speed-and-stations]], [[2026-10-31-scripts-library]],
  [[2026-10-31-shelf-grid-view]], [[2026-10-31-mini-player-expand]]

The brainstormed backlog of 2026-10-26 is exhausted except for the item below.

## Backlog

- **TPDB as a second stash-box endpoint in Stash**, optional: only if StashDB coverage gaps
  appear. Needs the user's TPDB API key; configured in Stash, then flix's [[stashdb]] layer
  would read a second endpoint. Chromecast was dropped ([[airplay-not-chromecast]]).

- **Scrubbing, to tune from use**: fine scrubbing (slower as the finger moves up from the
  bar) and the picture swipe in the station player ([[seek-bar-markers]]).


- **Open**: keep or drop the ad-hoc "Station" entry points (by Related, in the filter bar, on
  entity pages) now that only saved stations are remembered ([[stations-only-user-made]]).
- **Faster Home, what is left**: a cold feed is 1.0–1.2 s, most of it the Featured pool's
  0.8 s whole-library query (`tags { id favorite }` alone is 0.5 s of it); it is served stale
  after writes and kept across restarts, so a user rarely waits for it ([[featured-ranking]]).

## Later

- A hosted endpoint behind strong auth (Cloudflare Access or Tailscale Funnel with an identity
  provider), not just the app password. Today flix is LAN-only ([[lan-only-no-ingress]]).
- Decide whether to replace parts of Stash's backend behind the BFF; the web app only knows
  `@flix/shared` types so this stays possible ([[shared-contract]]).

## Known gaps

- A `navigate({ to: '.' })` reducer sees the union of every route's search type, so `prev` is
  cast in `StationEditor` ([[route-api-circular-types]]).
- The `hls.js` chunk is 574 kB; it loads only for transcoded videos (43 of 520 files on
  2026-10-26, [[player]]).
- Related videos are scored in the BFF from up to 120 candidates (same performers, studio,
  tags), not the whole library ([[related-videos]]).
- The CNPG backup mirror to the NAS has been OOMKilled since 2026-10-28 (base backup grew to
  ~1 GB when the Servarr databases moved into CNPG); flix's `flix` database is covered by the
  cluster's own backups and WAL archive meanwhile. The fix (a memory bump) is owned by the
  k8s repo ([[postgres-cnpg]]).

## Open questions

- Did the `z-10` on the mini-player's picture overlay fix the iPhone tap, or does only Expand
  work there? Needs the user's phone ([[mini-player]]).

- Does Whisparr's daily `RefreshStudios` still add newly released scenes to a studio whose
  new-items flag is off? Baseline for a later diff: 9,363 scenes across 36 studios at
  2026-10-30 17:00 UTC ([[whisparr-nothing-monitored]], [[whisparr-api]]).
- The duplicates workbench has never seen a real group: the library had none at any distance
  on 2026-10-30 ([[duplicates-workbench]]).
