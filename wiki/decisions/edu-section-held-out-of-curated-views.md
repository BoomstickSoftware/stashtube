---
title: Edu videos are held out of what flix picks, not out of what you search
kind: decision
summary: Edu videos stay out of Home, Featured, For you, related videos and stations and do not steer recommendations, but Browse, search and entity pages show them.
tags: [edu, blocklist, recommendations]
status: superseded
superseded_by: unlisted-and-vault
decided: 2026-11-09
by: user
verified: 2026-11-09
updated: 2026-11-09
related: [vault, blocklist-and-exclusions, iphone-first-polish]
---

# Edu videos are held out of what flix picks, not out of what you search

**Decided** 2026-11-09 by the user. **Status** superseded the same day by [[unlisted-and-vault]]: Edu became the Vault, and categories one of four kinds of Unlisted.

## Context

The user wanted a separate section for educational and tutorial videos, found by tag, that does
not cross streams with recreational viewing. The choices were how far the hold reaches, whether
Edu watching shapes recommendations, where the link goes on the phone, and the name.

## Decision

- Held out of the views flix assembles: every Home row, Featured, For you, related videos,
  stations, Shuffle everything. **Browse, text search and performer/studio pages show them**
  (the stricter option, hiding them there too, was declined).
- Edu plays do not feed the affinity behind For you, Featured and "Because you watched".
- Named **Edu**, route `/edu`; a **header icon on the phone** (the tab bar stays at seven), a nav
  item on desktop.
- Categories are managed both ways: a toggle on each category page and a list in Settings with
  add (search) and remove.

## Consequences

- A new feed or picker must use `curated(await exclusions())` or `noEdu`, as well as the blocklist.
- Related videos keep an Edu video's neighbours inside Edu (agent's reading of "not crossing
  streams", shipped with the decision).
- History, Stats, Continue and playlists show Edu videos: they record what you did or chose.

## Revisit if

Edu videos keep surfacing somewhere unwanted (then consider the stricter Browse/search hold), or
a second section of the same kind is wanted (then generalise `edu_tags` into named sections).
