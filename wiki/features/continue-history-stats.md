---
title: Continue, History and Stats
kind: feature
summary: The Continue nav item with its History and Stats tabs, what counts as a play, and how a history entry is removed.
tags: [history, stats, resume, accounting]
status: current
verified: 2026-11-09
updated: 2026-11-09
routes: [/continue, /history, /stats]
api: [GET /api/history, DELETE /api/history/:id, GET /api/stats, POST /api/continue/clear, POST /api/scenes/:id/watched]
code: [apps/web/src/pages/Continue.tsx, apps/web/src/pages/History.tsx, apps/web/src/components/Bulk.tsx, apps/web/src/components/CardMenu.tsx, apps/server/src/api.ts, apps/server/src/continue.ts, apps/server/src/stash.ts]
related: [player, stations, private-session, stash-owns-activity, home-feed, continue-clears-and-expires]
---

# Continue, History and Stats

Continue watching moved out of the home feed into its own nav item on 2026-10-26, with
History and Stats as tabs (`WatchTabs` in `pages/History.tsx`).

## Behaviour

- **Continue**: scenes with a resume point, from Stash ([[stash-owns-activity]]). Resume points
  are saved by the [[player]] and by a station in Full mode ([[stations]]); none is kept in the
  first 30 s or past 95% (or the last 15 s), so end credits and a two-second look do not sit in
  Continue. Every successful save patches the scene's `resumeTime` into every cached card and
  the detail (`saveActivity` → `noteResume` in `lib/api/scenes.ts`), and a resume point that
  appears or goes nudges the nav badge's count (`['scenes','continue-count']`) and refetches it
  and the Continue list; a counted play bumps `playCount` the same way (`addPlay`). So the card
  you go Back to shows its progress bar and the Continue dot moves at once (since 2026-10-31;
  _before, both waited for a refetch that the server answered stale once more_, audit F3). _Until 2026-10-31_ only the last 15 s counted as finished: on that day 13 of the 49
  videos in Continue were past 90% and 14 under 3%. At the user's word the 13 were cleared the same
day (resume point 0 through `POST /api/scenes/:id/activity`; plays untouched): 49 → 36.
- **Leaving Continue** ([[continue-clears-and-expires]], since 2026-11-09): a video leaves when
  its resume point goes to 0, which plays and History never notice.
  - **Remove**: Select (under "More" on the phone) → Remove in the selection bar, "Remove from
    Continue" in the card menu (shown when the card has a resume point), and a button in the
    scene page's details. `POST /api/continue/clear {ids}` → `clearResume` (one
    `sceneSaveActivity` with 0 per video).
  - **Expiry**: the line above the list, "Remove untouched videos after N days" (7, 14, 30, 60,
    90 or never; `settings.continueDays`, default 30). `continue.ts` clears every resume point whose
    last play (or, with no play on record, the video's `created_at`) is older than that: 5 min
    after start, daily, and right after the setting changes.
  - **Mark as watched** (`POST /api/scenes/:id/watched`) counts one play and clears the resume
    point; the card menu offers it on unwatched videos and on any with a resume point.
- History and Stats show every video (_they left out blocked and "Not interested" ones until
  2026-11-09_, [[blocklist-and-exclusions]]).
- One cached query of every touched video feeds History, Stats and "For you"; cold it takes
  ~0.06 s (Stats answered in 0.05–0.15 s cold, 0.5 s before 2026-10-31, when it also asked
  Stash to count each tag's scenes; see [[featured-ranking]]).
- **History**: Stash's play history (`GET /api/history`). An entry can be removed with
  `DELETE /api/history/:id` (`removeFromHistory`); the check scripts never call it, and an
  accidental real play once had to be reset by hand ([[check-scripts-wrote-plays-to-stash]]).
- **Stats**: `GET /api/stats`; top performers count everyone (_limited to the Settings performer
  gender until 2026-10-31_, [[gender-switch-performers-page-only]]).
- A play counts after 20 s watched; "Mark as watched" on a scene counts one at once. Nothing is
  recorded in a [[private-session]].
- "Pick up a station" on Home is the station equivalent ([[home-feed]]).
