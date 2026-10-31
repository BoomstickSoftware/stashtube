---
title: A failed write shows a toast; no persistent "Stash is busy" pill
kind: decision
summary: Every mutation failure surfaces as a toast with the server's reason; flix does not show a persistent header status during Stash scans.
tags: [ux, errors, stash]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [web-app, stash-database-locked, 2026-10-31-ux-audit]
---

# A failed write shows a toast; no persistent "Stash is busy" pill

**Decided** 2026-10-31 (UX audit roadmap, [[2026-10-31-ux-audit]]). **Status** current.

## Context

Write failures were silent for 21 of 25 paths; the audit proposed a global error toast and, optionally, a header pill while Stash is locked by a scan ([[2026-10-31-ux-audit]], IA F1, F15).

## Decision

The toast only (shipped: a `MutationCache` `onError` in `client.ts`, [[web-app]]). No pill.

## Consequences

Actionable error copy (Phase 5) goes into the toast and `ErrorBox`; nothing watches Stash's lock state.

## Revisit if

scans keep surprising the user; then a pill driven by the last 502 is the next step.
