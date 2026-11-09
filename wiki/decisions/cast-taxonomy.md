---
title: Cast is filed as F / M / X categories in Stash, one mix plus cumulative counts
kind: decision
summary: Performer genders become three letters (F, M, X for everyone else); each video gets one mix category and cumulative count categories in Stash, and all-male casts (Cast: M) are blocked.
tags: [cast, stash, filters]
status: current
decided: 2026-11-09
by: user
verified: 2026-11-09
updated: 2026-11-09
related: [cast, blocklist-and-exclusions]
---

# Cast is filed as F / M / X categories in Stash, one mix plus cumulative counts

**Decided** 2026-11-09 by the user. **Status** current.

## Context

The user wanted to block or suppress all-male (and similar) casts while keeping all-female or
female-and-other ones, search by "at least one man and two or more women" style permutations, and
combine several in one search. Stash has no orientation field and cannot filter "every performer
is …".

## Decision

- Write flix-maintained Stash categories under "Cast", kept in sync automatically (user approved
  the writes).
- Three letters: female, male, and **X for every other gender** (trans and non-binary combined).
- One **mix** per video (blocking and unlisting work on it) plus **cumulative counts** (any count
  question becomes includes and excludes).
- All-male casts, solo or not, are one mix, **Cast: M**, and it is **blocked**.

## Consequences

- Browse, pinned rows, stations and the Vault filter cast through the existing category include /
  exclude: no new query shapes.
- Wrong genders in Stash file videos wrongly; fixing the performer fixes the videos on the next sync.

## Revisit if

Trans or non-binary casts need telling apart again (split X), or counts beyond 3+ matter.
