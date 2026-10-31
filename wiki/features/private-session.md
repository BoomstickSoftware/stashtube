---
title: Private session
kind: feature
summary: The ghost in the header that stops flix recording anything watched for the rest of the visit, what it blocks, what it lets through, and the rule for new writes.
tags: [privacy, private, accounting, stash]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/web/src/lib/privacy.ts, apps/web/src/components/Privacy.tsx, apps/web/src/lib/playback.ts]
related: [discreet-mode, pin-lock, player, moments, stations, stash-owns-activity]
---

# Private session

Nothing watched this visit is recorded. Started from the **ghost** in the header or Settings →
Privacy (`lib/privacy.ts`).

## Behaviour

- Lives in **sessionStorage** (`flix.private`), so it survives a reload and route changes and
  ends with the tab or the installed app; opening flix again starts a normal session.
- **Blocked**: plays and play time, resume points, "Mark as watched", rating, the O counter,
  markers from the player, and where a station is left. `useWatchAccounting` sends nothing;
  `guardWrite()` turns the deliberate actions into the toast "Private session: nothing is
  recorded".
- **Allowed**: favourites, playlists, Not interested, deletes and metadata edits. They are
  curation, not a trace of viewing.
- Verified headless 2026-10-30: 30 s of playback attempted no write with it on, three (play,
  activity ×2) with it off.

## Rule for new code

A new write that records what was watched must go through `guardWrite()` (shows the toast,
returns whether it ran) or check `isPrivate()` directly for writes that happen on their own.
