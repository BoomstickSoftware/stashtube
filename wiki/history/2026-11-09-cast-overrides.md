---
title: Cast set by hand (overrides)
kind: history
summary: A video's cast can be set on its page when Stash's performers miss someone; the Cast sync files it by the override.
tags: [cast, stash, scene]
status: record
verified: 2026-11-09
updated: 2026-11-09
related: [cast, data-model, 2026-11-09-cast-categories]
---

# Cast set by hand (overrides)

**Why.** The user reported men-only videos that have women in them. One was in `Cast: M`: its
only performer in Stash is a man; the woman was never attached (not identified), so the sync,
which reads performer genders, filed it men-only and the block hid it.

**What changed.**
- `cast_overrides` table (migration `0010`): scene id, women, men, other, title.
- `syncCast()` reads the overrides and files those videos by `castFrom(counts)`; `castOf()` now
  goes through `countOf()` and `castFrom()`.
- `PUT / DELETE /api/scenes/:id/cast` set or clear one and sync at once; `/api/scenes/:id`
  returns `cast` (counts, override flag, what the performers say); `/api/cast` lists overrides.
- Scene page: a Cast line with an editor (steppers, 44 px on touch); Settings → Cast: "Set by
  hand" with Use performers.

**Verified.** check.mjs (139 tests, castFrom cases); deploy check; the reported video set to 1
woman and 1 man moved from `Cast: M` to `Cast: F+M`.

See [[cast]].
