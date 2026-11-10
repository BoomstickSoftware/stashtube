---
title: The search box shows recent searches
kind: decision
summary: The empty search box lists the last eight searches and picks, kept in the browser; the user lifted the Discreet and Private objection, with one guard kept (a private session adds none).
tags: [search, privacy, ux]
status: current
decided: 2026-11-10
by: user
verified: 2026-11-10
updated: 2026-11-10
related: [search, private-session, discreet-mode, ux-delight-principles, 2026-11-10-polish-pass]
---

# The search box shows recent searches

**Decided** 2026-11-10 by the user ("fixing search recents would be nice, lift the restriction
for that"). **Status** current.

## Context

The UX review proposed recents and held them back: a list of past searches on the first screen
of search shows text that Discreet (blurred pictures) and a Private session otherwise keep off
the screen.

## Decision

- Focusing the empty search box lists up to eight recent entries, newest first: a text search,
  or a video, performer, studio or category picked from the results. A tap repeats it; the × on
  a row removes it; **Clear** empties the list.
- They live in this browser only (`localStorage` key `flix.search.recent`,
  `apps/web/src/lib/recents.ts`), never on the server.
- They show in Discreet mode and in a Private session. A Private session adds nothing to them.

## Consequences

- Someone handed the phone can read the recents by tapping search. Clear is one tap away.
- Writes go straight to storage, not through hook state: the phone's search box unmounts in the
  same tick as a search, and a queued state update on it never ran (found in the headless check).
