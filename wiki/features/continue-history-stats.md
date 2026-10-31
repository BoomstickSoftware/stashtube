---
title: Continue, History and Stats
kind: feature
summary: The Continue nav item with its History and Stats tabs, what counts as a play, and how a history entry is removed.
tags: [history, stats, resume, accounting]
status: current
verified: 2026-10-31
updated: 2026-10-31
routes: [/continue, /history, /stats]
api: [GET /api/history, DELETE /api/history/:id, GET /api/stats]
code: [apps/web/src/pages/Continue.tsx, apps/web/src/pages/History.tsx, apps/server/src/api.ts, apps/server/src/stash.ts]
related: [player, stations, private-session, stash-owns-activity, home-feed]
---

# Continue, History and Stats

Continue watching moved out of the home feed into its own nav item on 2026-10-26, with
History and Stats as tabs (`WatchTabs` in `pages/History.tsx`).

## Behaviour

- **Continue**: scenes with a resume point, from Stash ([[stash-owns-activity]]). Resume points
  are saved by the [[player]] and by a station in Full mode ([[stations]]); none is kept in the
  first 30 s or past 95% (or the last 15 s), so end credits and a two-second look do not sit in
  Continue. _Until 2026-10-31_ only the last 15 s counted as finished: on that day 13 of the 49
  videos in Continue were past 90% and 14 under 3%. At the user's word the 13 were cleared the same
day (resume point 0 through `POST /api/scenes/:id/activity`; plays untouched): 49 → 36.
- History and Stats leave out blocked and "Not interested" videos
  ([[blocklist-and-exclusions]]).
- One cached query of every touched video feeds History, Stats and "For you"; cold it takes
  ~0.06 s (Stats answered in 0.05–0.15 s cold, 0.5 s before 2026-10-31, when it also asked
  Stash to count each tag's scenes; see [[featured-ranking]]).
- **History**: Stash's play history (`GET /api/history`). An entry can be removed with
  `DELETE /api/history/:id` (`removeFromHistory`); the check scripts never call it, and an
  accidental real play once had to be reset by hand ([[check-scripts-wrote-plays-to-stash]]).
- **Stats**: `GET /api/stats`, limited to the Settings performer gender.
- A play counts after 20 s watched; "Mark as watched" on a scene counts one at once. Nothing is
  recorded in a [[private-session]].
- "Pick up a station" on Home is the station equivalent ([[home-feed]]).
