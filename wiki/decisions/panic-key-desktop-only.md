---
title: The panic key is a desktop feature
kind: decision
summary: Esc Esc stays keyboard-only; the phone gets no touch equivalent and hides the Panic key and Keyboard sections in Settings.
tags: [ux, privacy, settings, mobile]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [private-session, 2026-10-31-ux-phase0-web]
---

# The panic key is a desktop feature

**Decided** 2026-10-31 (UX audit roadmap, [[2026-10-31-ux-audit]]). **Status** current.

## Context

The panic key (`Esc` twice jumps to a decoy URL) had no touch trigger, yet its Settings section and the Keyboard section showed on a phone ([[2026-10-31-ux-audit]], IA F10, phone 14). The phone is covered by the private session, discreet mode and the PIN lock.

## Decision

Desktop-only. The two sections are `touch:hidden` (shipped in [[2026-10-31-ux-phase0-web]]); no gesture is added.

## Consequences

Nothing to build. The wiki's privacy pages describe the panic key as a keyboard feature.

## Revisit if

the user asks for a touch panic gesture (three-finger tap or a long press on the logo were the candidates).
