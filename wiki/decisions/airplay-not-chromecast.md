---
title: AirPlay, not Chromecast
kind: decision
summary: flix supports AirPlay through signed absolute playback links and will not add Chromecast; the user has AirPlay receivers only.
tags: [playback, airplay, ux]
status: current
decided: 2026-10-29
by: user
verified: 2026-10-30
updated: 2026-10-30
related: [player, lan-only-no-ingress, roadmap]
---

# AirPlay, not Chromecast

**Decided** 2026-10-29 by the user. **Status** current.

## Context

The backlog listed Chromecast next to the AirPlay support that shipped in UX round 1.

## Decision

Not Chromecast: the user has AirPlay. AirPlay works through signed per-scene playback links
that carry their own token and use the absolute `MEDIA_ORIGIN` IP, because receivers fetch the
video themselves and cannot resolve hosts-file names ([[player]], [[lan-only-no-ingress]]).

## Consequences

- Drop Chromecast from the backlog ([[roadmap]]); do not add the Cast SDK.
- Keep the signed-link path working whenever the media routes change.

## Revisit if

A Chromecast appears in the house.
