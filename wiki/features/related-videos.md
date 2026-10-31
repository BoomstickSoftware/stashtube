---
title: Related videos
kind: feature
summary: How the BFF scores related videos from up to 120 candidates sharing performers, studio or tags, reshuffled daily, with the blocklist applied, and tops up a short row from the studio's folder.
tags: [related, recommendations, scene]
status: current
verified: 2026-10-31
updated: 2026-10-31
api: [GET /api/scenes/:id/related]
code: [apps/server/src/stash.ts, apps/web/src/pages/Scene.tsx]
related: [scene-page, home-feed, stations, blocklist-and-exclusions]
---

# Related videos

The scene page's Related sidebar and "More like this" grid (8 + 16 from `lg`, all 24 as rows on
a phone; [[scene-page]]), and the seed of a drifting station ([[stations]]) and of Home's
"Because you watched" row ([[home-feed]]).

## Behaviour

- `relatedScenes()` in `stash.ts` runs up to three Stash queries of 40 each (scenes sharing a
  performer, the same studio at depth 0, any of the first 20 tags), so up to 120 candidates,
  the scene itself and exclusions left out ([[blocklist-and-exclusions]]).
- Score in the BFF: 10 per shared performer, 4 for the same studio, 0.25 per shared tag, plus
  the rating (0..1, 0.5 when unrated). The top 24 are returned.
- Candidates are fetched with `random_<daySeed>`, so the mix reshuffles daily; before Round 4
  constant seeds froze them.
- Fewer than 8 (`RELATED_MIN`), e.g. a video nothing is identified on: topped up from the
  folder above its own (`groupFolder`: the studio's, or for a pack the uploader's; never the
  library itself), then with unwatched videos, so the row is never empty. The folder is matched
  with `MATCHES_REGEX` on the escaped path: Stash's `INCLUDES` on a path matched 2,496 of 2,502
  scenes. _Until 2026-10-31_ an unidentified video had an empty Related row.
