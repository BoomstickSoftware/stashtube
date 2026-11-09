---
title: Unlisted is a level between normal and blocked, and the Vault replaces Edu
kind: decision
summary: Videos, categories, performers and studios can be Unlisted, kept off what flix picks but still in Browse and search, all listed in one Vault that replaces Edu.
tags: [unlisted, blocklist, recommendations]
status: current
decided: 2026-11-09
by: user
verified: 2026-11-09
updated: 2026-11-09
related: [vault, edu-section-held-out-of-curated-views, blocklist-and-exclusions, whisparr-nothing-monitored]
---

# Unlisted is a level between normal and blocked, and the Vault replaces Edu

**Decided** 2026-11-09 by the user. **Status** current.

## Context

The Edu section held a set of categories off Home. The user wanted the same at every level
(video, performer, studio, category): out of featured, new-release and suggested areas and
generated previews, available in Browse and search and in entity lists, and recommended only
when the triggering video carries the same marks.

## Decision

- A level named **Unlisted**, on videos (by hand), categories, performers and studios; mutually
  exclusive with blocked.
- **The Vault** lists every Unlisted video and keeps the full Browse refinement; it replaces Edu
  (renamed and combined, as the user allowed), with `/edu` redirecting.
- Related videos: an Unlisted candidate only when **all** its reasons are true of the source
  (the stricter of the two options offered).
- New releases: **still fetched, never featured**; the not-downloaded shelf hides them.

## Consequences

- Every feed or picker uses `curated()` or `noUnlisted`; the deploy check tests the hold.
- Named entities in pinned rows and stations lift only themselves.
- Agent's choices within the decision: the reserved Stash tag for videos, the name-based category
  match on the StashDB shelf, a video unlisted by hand only follows other hand-unlisted ones.

## Revisit if

Unlisted videos surface somewhere unwanted, or several separate vaults are wanted (then add a
group to the `unlisted` rows).
