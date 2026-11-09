---
title: A second tags EXCLUDES criterion in a nested AND is ignored by Stash
kind: gotcha
summary: A separate `tags EXCLUDES depth 0` level beside the blocklist's tag exclusion was ignored, so Edu videos stayed on Home; keep every excluded tag in one criterion.
tags: [stash, filters, blocklist, edu]
status: current
symptom: "Edu videos still show in Featured / Recently added after adding an Edu category"
found: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
code: [apps/server/src/stash.ts, scripts/deploy-check.mjs]
related: [vault, blocklist-and-exclusions, stash-filters-have-no-id-criterion]
---

# A second tags EXCLUDES criterion in a nested AND is ignored by Stash

## Symptom

After "Educational" was made an Edu category, Featured and Home's Recently added still showed
its videos. `GET /api/scenes?noEdu=1` counted 2,679, the whole library; `edu=1` found the 5.
No error anywhere: Stash answered 200.

## Cause

`withExclusions` added the Edu tags as their own level, `{ tags: { value, modifier: EXCLUDES,
depth: 0 } }`, one `AND` below the blocklist's `tags EXCLUDES depth -1` (which always holds the
"Not interested" tag). Stash v0.31.1 returned the excluded scenes anyway. The same ids through
`xtags`, merged into the existing criterion, were excluded (2,674). Whether the depth 0 or the
second `tags` criterion is to blame was not isolated; nested `tags INCLUDES depth 0` beside it
(`edu=1`) does work.

## Fix

One `tags EXCLUDES` criterion, depth -1, holding the blocked tags and the Edu ones. The unit test
in `stash.test.ts` pins that shape.

## Avoid

- Unit tests check the filter's shape, not what Stash does with it. A new exclusion needs a
  live check: `deploy-check.mjs` now fails if an Edu video reaches Home or Featured.
- Prefer extending an existing criterion over adding another of the same field.
