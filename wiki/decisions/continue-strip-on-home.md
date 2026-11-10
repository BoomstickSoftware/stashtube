---
title: Home has a one-tap Continue strip under the hero
kind: decision
summary: Resuming cost four taps after the five-tab change; a compact strip of the last six unfinished videos sits under the Home hero and a tap resumes and plays, while the Continue list stays under You.
tags: [home, resume, navigation, ux]
status: current
decided: 2026-11-10
by: agent, confirmed by user
verified: 2026-11-10
updated: 2026-11-10
related: [five-tab-navigation, home-feed, continue-history-stats, continue-clears-and-expires, 2026-11-10-ux-revamp]
---

# Home has a one-tap Continue strip under the hero

**Decided** 2026-11-10: proposed by the review, approved by the user with the UX plan.
**Status** current. Adds to [[five-tab-navigation]], does not undo it.

## Context

Since Continue moved under You, resuming was You → Continue watching → the card → Play. Research
puts continue-watching first on a media home ([[ux-delight-principles]], section 6).

## Decision

- `ContinueStrip` (`apps/web/src/pages/Home.tsx`) shows the six most recently watched unfinished
  videos right under the hero: a small picture with a progress bar and the time left. A tap opens
  the video and plays from its resume point. "All" opens the Continue list. Nothing in progress,
  no strip.
- Everywhere else, a card that shows a progress bar also resumes and plays on tap.

## Consequences

- Continue is not a tab again; its list, expiry and clearing stay where they are
  ([[continue-clears-and-expires]]).
- The strip reads the same in-progress list, so removing a video from Continue removes it here.

## Revisit if

the strip crowds out Featured on the first screen.
