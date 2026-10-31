---
title: Settings live next to the page they affect
kind: decision
summary: A setting sits where its effect is seen (intro skip in the player's gear menu, Featured dials in Settings' Home section); only global ones go on the Settings page, device-only ones stay in that browser.
tags: [settings, ui, architecture]
status: current
decided: 2026-10-26
by: user
verified: 2026-10-30
updated: 2026-10-31
related: [single-user-no-login, people-pages, featured-ranking, data-model]
---

# Settings live next to the page they affect

**Decided** 2026-10-26. **Status** current.

## Context

Early rounds added per-studio intro skip, the performer gender switch, a panic URL, Featured
dials and several player preferences; a single Settings page was filling up.

## Decision

A setting is placed where its effect is seen: intro skip in the player's gear menu while
one of the studio's videos plays (_described here as "on the studio page" until 2026-10-31;
the control was always in the player_, [[people-pages]]), Featured dials in Settings → Featured with a live preview
([[featured-ranking]]), playback choices in the player's gear menu. The Settings page keeps only
what is global: performer preferences, privacy, cache, panic URL, blocklist, Not interested,
shortcuts.

## Consequences

- Server-side (`settings` table, [[data-model]]): anything about the person, shared across
  devices ([[single-user-no-login]]).
- Browser-side (`lib/storage.ts`): anything about the device or session (quality, theater,
  autoplay, volume, discreet, keep-playing, stacked filters, PIN, private flag).
- On/off settings render with the shared `Switch`.

## Revisit if

A setting is needed on two pages at once; then it is global.
