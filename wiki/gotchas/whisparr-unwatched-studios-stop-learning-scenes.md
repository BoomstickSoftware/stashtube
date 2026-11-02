---
title: An unwatched studio in Whisparr stops learning new scenes
kind: gotcha
summary: Whisparr's daily refresh adds new StashDB scenes only for studios and performers with monitoring on, so an unwatched one's list lags StashDB by weeks; flix's shelf reads StashDB directly and does not depend on it.
tags: [whisparr, stashdb, metadata, refresh]
symptom: "the newest scenes of a studio are on StashDB but not in Whisparr"
found: 2026-11-02
status: current
verified: 2026-11-02
updated: 2026-11-02
related: [whisparr-sync, whisparr-shelf, stashdb, whisparr-watch-cascades-to-studios-and-performers]
---

# An unwatched studio in Whisparr stops learning new scenes

## Symptom

Reported by the user: with both "Monitor scenes" and "Monitor new items" off, refreshing a
studio pulls no new scenes; with either on, it does, and they arrive monitored. Measured
2026-11-02 with flix's shelf (StashDB's catalogue, each scene labelled by whether Whisparr
holds it): of 8 unwatched library studios, 6 had their newest 1–4 StashDB scenes unknown to
Whisparr, its list stopping 1–2 weeks earlier. Every watched studio was complete; one showed
13 missing scenes, all of them import exclusions left by deletes.

## Cause

`RefreshStudios` and `RefreshPerformers` run every 1,440 minutes, but only watched entries add
scenes they do not have; and what they add is monitored ("new items"), old releases included
([[whisparr-watch-cascades-to-studios-and-performers]]).

## Consequence

Whisparr is not a usable catalogue for anything unwatched. It does not need to be: flix's
"Not in your library yet" shelf reads StashDB directly and its Get adds that one scene to
Whisparr and searches it ([[whisparr-shelf]]). Monitoring a studio just to refresh it would
bring the cascade and a download window with it. Options: [[whisparr-sync]], "Open".
