---
title: Studio name filter and leaving VR out
kind: feature
summary: Words that keep a studio, and a switch that keeps VR scenes, out of Discover, the not-downloaded shelf and the automatic Gets; library lists are never filtered by either.
tags: [discover, blocklist, settings, whisparr, vr]
status: current
verified: 2026-11-11
updated: 2026-11-11
routes: [/settings, /discover]
api: [PUT /api/settings]
code: [apps/server/src/studioFilter.ts, apps/server/src/catalog.ts, apps/server/src/getqueue.ts, apps/server/src/unlisted.ts, apps/web/src/pages/Settings.tsx]
related: [discover, blocklist-and-exclusions, whisparr-shelf, settings-page, 2026-11-09-discover-hides-vr]
---

# Studio name filter and leaving VR out

Two settings under Settings → Library that work like the blocklist
([[blocklist-and-exclusions]]): they decide what flix offers to download and what it downloads
by itself, and never touch videos already in the library.

| Setting | What it keeps out |
|---|---|
| **Leave out studios by name** (`settings.studioFilters`, a list of words) | a StashDB scene whose studio's name contains one of the words, in any case (`matchesStudioFilter`) |
| **Leave VR scenes out** (`settings.hideVr`) | a scene whose title or a category says VR ([VR], VR, Virtual Reality, 180°, 360°), or whose studio's name carries VR in capitals or starts with "Virtual" (`isVrScene`) |

Both apply in three places (`apps/server/src/studioFilter.ts`):

- **Discover**: left out of the page; "Show blocked & VR" brings them back for that view. Word
  matches are counted with the blocked ones (`hidden`), VR on its own (`vr`).
- **The not-downloaded shelf** on performer and studio pages (`dropHiddenWanted`).
- **The automatic Gets** for followed performers and studios (`eligible` in `getqueue.ts`):
  such a release is never queued.

_Until 2026-11-11 the VR switch applied to Discover only, and there was no word list._ A
followed studio that matches a word is still followed; only its releases stop being offered.

## Why words as well as the VR rule

Asked by the user 2026-11-11, who suspected VR studios were getting through. Counted in the
StashDB mirror that day (2,608 studios, 19,614 scenes): the VR rule matches 109 studios and
2,389 scenes by studio name; 3 studios have the letters "vr" in another case and 13 carry
another hint (virtual, reality, 180, 360, 3d) the rule does not read, and a VR studio whose
name says nothing cannot be caught by any rule. The word list covers those by hand. Words are
stored lower-case, once each, 2 to 40 characters, at most 50.

**The VR switch was off in production on 2026-11-11**, which by itself explains VR showing up
in Discover. It is the user's setting and was left as found.

## Verified

`vr.test.ts` and `discovery.test.ts` (the matcher, the combined check, the automatic Gets);
the Settings control at phone size with stubbed words. Not run against production data: the
filters have no words there yet.
