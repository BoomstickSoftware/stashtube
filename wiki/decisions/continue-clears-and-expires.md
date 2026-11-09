---
title: Continue can be cleared and expires after 30 days
kind: decision
summary: Continue gets multi-select clearing, resume points untouched for 30 days expire on their own, and Mark as watched also clears the resume point; plays and History are never touched.
tags: [history, resume, continue, ui]
status: current
decided: 2026-11-09
by: user
verified: 2026-11-09
updated: 2026-11-09
related: [continue-history-stats, stash-owns-activity, player, 2026-11-09-strategy-review]
---

# Continue can be cleared and expires after 30 days

**Decided** 2026-11-09 by the user (strategy review). **Status** current; built in initiative B
of [[roadmap]].

## Context

Continue lists every video with a resume point in Stash ([[continue-history-stats]]). Nothing in
flix removed one, so it only grew: 36 after the hand cleanup of 2026-10-31, 79 on 2026-11-09
(11 past 90%, 19 under 10%, 38 untouched for 7–30 days).

## Decision

- Continue has **Select** with a bulk "Remove from Continue", plus one-video removal from the
  card menu and the scene page.
- A resume point **untouched for 30 days expires** (set to 0 in Stash).
- **Mark as watched** also clears the resume point, and is offered on played videos too.

## Consequences

- Removing from Continue sets the resume point to 0 through the existing activity write; play
  counts, play history and History are untouched ([[stash-owns-activity]]).
- These are writes that record viewing state, so they go through `guardWrite()` like the rest
  ([[private-session]]); the check scripts never call them ([[prod-checks-read-only]]).

## Revisit if

30 days turns out to drop things still meant to be finished, or the list stays long anyway.
