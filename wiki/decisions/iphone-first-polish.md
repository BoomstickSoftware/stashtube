---
title: The iPhone is the primary client; polish it over everything else
kind: decision
summary: The owner uses flix mostly on an iPhone 17 Pro Max; every change is designed, verified and polished for that phone first, and the desktop only has to be fine.
tags: [mobile, ios, ux, priorities]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [mobile-first-ui, mobile-checks, installable-app, player, 2026-10-31-ux-audit]
---

# The iPhone is the primary client; polish it over everything else

**Decided** 2026-10-31 by the user, after the UX audit roadmap shipped. **Status** current.

## Context

flix has a desktop layout and a phone layout, and the audit treated both. The user's words:
the primary interaction with this app is a mobile device (iOS, iPhone 17 Pro Max); we need
to optimise for this over everything else; the desktop app is fine, but mobile needs to be
"A+++ polished".

## Decision

Phone first, always: design, build and verify every change at the iPhone's size and with
touch before anything else (440 × 956 CSS px at 3×, Safari and the installed standalone
app, [[mobile-checks]]). Desktop regressions are fixed; desktop polish never takes
precedence over phone polish, and a trade-off between the two goes the phone's way.

## Consequences

- Every initiative that touches the web app ends with a phone screenshot or flow
  (`mobile-check`, `phone-flow`, `webkit-mini-check` for Safari-specific behaviour).
- Roadmap ordering weighs phone items first; the audit's open items are ranked that way.
- The rules in [[mobile-first-ui]] (44 px targets, labels on touch, sheets, no hover
  reliance, safe areas, standalone mode) are mandatory, not advisory.
- The desktop stays usable and gets fixes, but no desktop-only polish initiative runs while a
  phone item is open.

## Revisit if

the user's primary device changes.
