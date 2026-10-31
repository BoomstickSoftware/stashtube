---
title: Library tools are a group at the top of Settings, not a page of their own
kind: decision
summary: Clean up, Duplicates, Blocklist and Not interested form a "Library" group at the top of Settings; no new tab or route hub.
tags: [ux, settings, navigation]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [settings-next-to-page, cleanup-page, duplicates-workbench, 2026-10-31-ux-audit]
---

# Library tools are a group at the top of Settings, not a page of their own

**Decided** 2026-10-31 (UX audit roadmap, [[2026-10-31-ux-audit]]). **Status** current.

## Context

Clean up and Duplicates were reachable only through a red card at the top of Settings; the audit proposed either a Settings group or a `/library` hub in the nav ([[2026-10-31-ux-audit]], IA F9, desktop 11). The tab bar already has seven items.

## Decision

A Settings page in five headed groups with an anchor strip (Library, Feed, Playback, Privacy, Advanced); Library holds Clean up, Duplicates, Blocklist, Not interested. One page, per [[settings-next-to-page]].

## Consequences

Phase 4/5 restructures `Settings.tsx`; no routing change.

## Revisit if

the library tools grow into a workflow of their own (scheduled cleanups, reports).
