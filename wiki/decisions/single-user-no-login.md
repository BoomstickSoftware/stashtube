---
title: Single user, no login, preferences shared across devices
kind: decision
summary: flix has one user and no multi-user plans; preferences live centrally in the settings table, and auth or per-user scoping is never proposed.
tags: [auth, settings, architecture]
status: current
decided: 2026-10-29
by: user
verified: 2026-10-30
updated: 2026-10-30
related: [optional-login, settings-next-to-page, lan-only-no-ingress, pin-lock, featured-ranking]
---

# Single user, no login, preferences shared across devices

**Decided** 2026-10-29 by the user. **Status** current.

## Context

Featured weights and other preferences raised the question of per-user storage, and the
optional password login exists in the code ([[optional-login]]).

## Decision

"I am the only user and have no intentions of adding multi-user support or even a login."
Preferences such as the Featured weights are stored in the server's `settings` table and are
the same on every device ([[featured-ranking]]). Things that are about a device, not the
person (quality, theater, discreet, stacked filters, keep-playing), stay in that browser's
localStorage ([[settings-next-to-page]]).

## Consequences

- Never propose per-user scoping, accounts, roles or authentication.
- `FLIX_PASSWORD` stays unset in production; privacy on the LAN comes from
  [[lan-only-no-ingress]] and the browser-side layers ([[pin-lock]]).
- A hosted endpoint, if ever, goes behind an identity-aware proxy, not an app login
  ([[roadmap]]).

## Revisit if

The user says another person will use flix.
