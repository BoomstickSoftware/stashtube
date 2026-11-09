---
title: Cast categories
kind: feature
summary: flix files every video by cast (F, M, X) as Stash categories, one mix plus cumulative counts, so mixes can be blocked and counts filtered.
tags: [cast, stash, filters, blocklist]
status: current
verified: 2026-11-09
updated: 2026-11-09
api: [GET /api/cast, POST /api/cast/sync, PUT /api/scenes/:id/cast, DELETE /api/scenes/:id/cast]
code: [apps/server/src/cast.ts, apps/server/src/stash.ts, apps/web/src/pages/Settings.tsx, apps/web/src/components/CastFilter.tsx, apps/web/src/components/CastLine.tsx, apps/web/src/lib/api/cast.ts, scripts/deploy-check.mjs]
related: [cast-taxonomy, blocklist-and-exclusions, vault, browse-and-filters, data-model]
---

# Cast categories

Stash has no field for who a scene is "for", and its scene filter can say "has a performer who
is …" but not "every performer is …". So flix computes it and writes Stash categories under a
parent **Cast**, which every filter, the blocklist and Unlisted already understand
([[cast-taxonomy]]).

## Behaviour

- **Letters**, from each performer's gender in Stash: **F** female, **M** male, **X** anyone
  else (trans women, trans men, non-binary, intersex).
- **Mix**, exactly one per video: `Cast: F`, `M`, `X`, `F+M`, `F+X`, `M+X`, `F+M+X`, or
  `Cast: Unknown` when it has no performers or one without a gender (nothing else is claimed then).
- **Counts**, cumulative: `Cast: Women 1+`, `2+`, `3+`; `Cast: Men 1+`, `2+`, `3+`;
  `Cast: Other 1+`, `2+`. Two women and a man carry Women 1+, Women 2+ and Men 1+.
- **Settings → Library → Cast**: each mix with its count and Normal / Unlisted / Blocked (the
  category's own block and unlist); the last sync; Sync now.
- **Browse → Filters → Cast**: Women and Men each Any / None / 1+ / 2+ / 3+ / Exactly 1 / 2,
  Other Any / None / 1+ / 2+ / Exactly 1, and Mix chips (any of, with counts). `CastFilter.tsx`
  writes them as the includes and excludes in the table below into `tags` / `xtags` and reads
  them back, so pinned rows, stations, the Vault and shared URLs carry them.
- **Set by hand**: the scene page's details show "Cast: 1 woman, 1 man" with Edit (women, men,
  other steppers; Save; Use performers). Saving stores an override in `cast_overrides`
  ([[data-model]]) and runs the sync, so the categories follow in about 3 s. For a video whose
  performers in Stash miss someone (one not on StashDB). Settings → Cast lists them under "Set
  by hand", each with Use performers. Since 2026-11-09.
- **`Cast: M` is blocked** by the first sync (once; `settings.castSetup`), as the user chose. A
  solo male scene is `Cast: M` too (merged, by choice).

| Question | Filter |
|---|---|
| at least 1 man and 1+ women | include Men 1+, Women 1+ |
| at least 1 man and 2+ women | include Men 1+, Women 2+ |
| exactly 2 women | include Women 2+, exclude Women 3+ |
| no men | exclude Men 1+ and Cast: Unknown |
| any of these mixes | exclude every other mix and Unknown (the mixes partition the library) |

## How

- `syncCast()` reads every scene's performer genders and categories in one uncached query
  (`castInputs`) and the overrides, compares with `castOf()` (or `castFrom()` of the override), and fixes each category with bulk add / remove
  (`bulkSceneUpdate`, 500 ids a call). Categories are created on first run (`ensureTags`).
- Runs 90 s after start, from Settings, and once Stash has settled after a change, **before**
  the re-warm (`onStashChange` in `index.ts`). Its writes only expire `scene` and `tag` (served
  stale while they refresh), and afterwards `acceptOwnChanges()` takes Stash's new fingerprint
  as the baseline, so they are not seen as an outside change. _Until 2026-11-09_ it ran a minute
  after the warm, dropped every `scene` query, and its writes set off a second change, warm and
  sync ([[2026-11-09-cache-tags-round]]).
- flix owns these categories: a hand edit is put back on the next sync.

## Limits and numbers

- First production sync (2026-11-09): 2,774 videos, 9,019 categories added in 31 s; the mixes add
  up to the library. Men 1+ with exactly 2 women: 390 videos, the same through the filter panel
  and the API.
- Library on 2026-11-09: 1,716 performers (1,349 F, 362 M, 5 non-binary, none without a gender),
  2,753 videos: F+M 2,290, F 360, Unknown 80, M+X 10, F+M+X 9, F+X 3, M 1.
- Counts cap at 3+ (women, men) and 2+ (other); FMMM+ (210 videos) all read Men 3+.
- A performer with a wrong gender in Stash files the video wrongly, and so does a performer
  missing from the video (the first case, 2026-11-09: a men-only video that has a woman nobody
  identified); only a missing gender becomes Unknown. Fix the performer in Stash, or set the cast
  by hand. An override outlives later changes to the performers: drop it once Stash is right.
- Not in Discover yet: the StashDB mirror stores no performer genders.
