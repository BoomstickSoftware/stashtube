---
title: The Women / Men / Everyone switch affects only the Performers page
kind: decision
summary: The gender switch on the Performers page exists so the user can avoid scrolling through men there; it must not steer Home, Stats, search or the People filters.
tags: [ux, performers, settings]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [people-pages, settings-next-to-page, 2026-10-31-ux-audit]
---

# The Women / Men / Everyone switch affects only the Performers page

**Decided** 2026-10-31 (UX audit roadmap, [[2026-10-31-ux-audit]]). **Status** current.

## Context

`performerGender` is saved as a global setting and today also shapes Home's recommendations, Stats, search and every People filter (`api.ts`, `blocklist.ts`), without Home refreshing ([[2026-10-31-ux-audit]], IA F7). The user built the switch for one purpose: the Performers directory.

## Decision

The switch is **page-local**: it filters the Performers page only. Every other consumer of `performerGender` stops reading it (or reads a separate setting with its own control, if one is wanted later). The switch stays on the page, per [[settings-next-to-page]].

## Consequences

An initiative decouples the setting: the Performers page keeps `?gender=` (or a per-browser preference); `blocklist.ts` people criteria, `recommendations`, `stats` and `findPerformers` for search drop the gender criterion. Stats and Home then include everyone unless the People preferences say otherwise.

## Revisit if

the user wants a global "who appears" preference again; then it is a Settings → Feed control, not the directory switch.
