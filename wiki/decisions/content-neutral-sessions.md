---
title: Assistant sessions work with ids and counts, never library names
kind: decision
summary: The user wants library terminology (titles, performer, studio and category names, descriptions) kept out of assistant chat history; sessions reach live data only through the neutral scripts and refer to things by id.
tags: [privacy, scripts, context, operations]
status: current
decided: 2026-11-10
by: user
verified: 2026-11-10
updated: 2026-11-10
related: [neutral-observability, github-public-mirror, prod-checks-read-only, gather-context, scripts-library]
---

# Assistant sessions work with ids and counts, never library names

**Decided** 2026-11-10 by the user. **Status** current.

## Context

The library is adult content. Earlier sessions printed titles and names into the chat while
investigating. The user asked for scripts that give observability while insulating the
session from content: ids rather than names, counts rather than field values, and scripts
that accept neutral input too. The user's limit: this must not handicap the help given, so it
applies "to whatever extent is reasonable".

## Decision

- A session refers to library things by id, count or role ("scene 3079", "tag id 41", "a studio").
- Live data is read through `node scripts/neutral.mjs` (`api`, `stash`, `whisparr`, `db`,
  `logs`, `redact`) or `--neutral` on `stash.py` / `whisparr.py`. Screenshots come from the
  headless scripts in their default neutral mode. How: [[neutral-observability]].
- A session never types a name or title into a command; it looks things up by id.
- A new script that prints live data prints it through `scripts/lib/neutral.mjs`.
- When a question truly depends on the content itself (is this the right match, is this title
  wrong), the session gives the user the id and the user looks.

## Consequences

- Raw `curl` of `/api`, bare `stash.py q` and old pod logs go through `neutral.mjs redact`;
  the scripts that used to print names take `--names` / `--show` / `--content` for the rare case.
- It is a principle, not a hard line (user, 2026-11-10): the user can lift it for a task, and a
  bug that needs the content outranks it for that step.
- `private/` is not read in a session unless the user asks.
- Static UI copy and tracked source still contain a few generic terms; that is accepted.
- Ids are pointers, not secrets: this keeps words out of the transcript, nothing more.

## Revisit if

the neutral output blocks a real investigation more than once; record the case here first.
