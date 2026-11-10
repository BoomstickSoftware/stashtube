---
title: Blocklist and exclusions
kind: architecture
summary: Block only stops downloads (Discover, the not-downloaded shelf, the automatic Gets); library lists apply the Unlisted hold and the performer defaults through exclusions(), and nothing hides owned videos for good.
tags: [blocklist, filters, stash, settings, discover]
status: current
verified: 2026-11-09
updated: 2026-11-09
code: [apps/server/src/blocklist.ts, apps/server/src/stash.ts, apps/server/src/catalog.ts, apps/server/src/getqueue.ts, apps/server/src/unlisted.ts, apps/web/src/pages/Settings.tsx]
related: [hide-means-delete-block-or-unlist, data-model, stash-layer, stash-filters-have-no-id-criterion, people-pages, vault, discover, whisparr-shelf]
---

# Blocklist and exclusions

**Rule 4: Block stops downloads; it never hides a video you have.** Since 2026-11-09
([[hide-means-delete-block-or-unlist]]) the three marks are: **Not interested** = delete it,
**Block** = never download it, **Unlist** = keep it off the views flix picks for you ([[vault]]).

## Block (downloads)

Rows of the `blocks` table ([[data-model]]): a tag, performer or studio by Stash id, set from the
entity's page (Block, with Undo) or Settings → Library → **Hidden**. Applied to StashDB scenes,
matched through the mirror (performers and studios by their StashDB ids, categories by name):

| Where | How |
|---|---|
| Discover | `blockedSets()` in `catalog.ts`; "Show blocked & VR" (`unblocked=1`) lifts it ([[discover]]) |
| Home's not-downloaded shelf | `dropHiddenWanted()` in `unlisted.ts`, with the Unlisted ones ([[whisparr-shelf]]) |
| The daily discovery of followed performers' and studios' new releases (the automatic Gets) | `discoverNew()` in `getqueue.ts`: a blocked followed entity is skipped, and so is a scene with a blocked performer, studio or category (categories since 2026-11-09) |

A Get pressed by hand is not checked. Blocking or unblocking kicks the Whisparr guard, so a
blocked performer does not stay monitored ([[whisparr-sync]]). One entity may be both blocked and
Unlisted (_until 2026-11-09 setting one cleared the other_).

The Cast categories cannot be blocked usefully (the StashDB scenes carry no Cast categories), so
Settings → Cast offers Normal / Unlisted only and clears an old block when either is picked
([[cast]]).

## Library lists: `exclusions()`

`exclusions()` in `blocklist.ts` returns what every library query applies: the Settings performer
defaults (age, ethnicity) and the Unlisted sets, held out only where a view asks (`holdUnlisted`
via `curated()`, or `noUnlisted`): Home, Featured, stations ([[vault]]). Its
`tags`/`performers`/`studios` start empty and carry a query's own excludes. `withExclusions` in
`stash.ts` merges them into one EXCLUDES criterion per field ([[second-tags-exclusion-ignored]]).
`isBlocked()` and `dropBlocked()` still run on History, Stats, "Because you watched", station
resume points and the entity lists; with the blocklist gone from `exclusions()` they only honour
the Unlisted hold.

`unblocked=1` on a library list now only drops the performer defaults; the Filters toggle reads
"Ignore my performer defaults" and its chip "Performer defaults off" ([[browse-and-filters]]).
Cleanup sets it ([[cleanup-page]]).

_Until 2026-11-09_ `exclusions()` also carried the blocklist and the **Not interested** tag, so a
blocked performer's videos and "Not interested" videos left every list, search, feed and related
query, and "Show blocked" brought them back. Playlists were the exception
([[playlists-ignore-blocklist]]).

## Not interested

The card menu's **Not interested: delete…** opens the delete dialog ([[delete-via-whisparr]]),
on phones too (the dialog confirms). The scene page's Delete is the same act. The old Stash tag
**Not interested** no longer hides anything; Cleanup lists videos still carrying it with Delete
all and Keep (Keep takes the tag off; `GET /api/scenes/hidden`, `DELETE /api/scenes/:id/hidden`;
the PUT is gone). There were none on 2026-11-09.

## Avoid

Any new finder or feed must call `exclusions()` (scenes) and a feed or picker `curated()` too
([[vault]]); anything that offers StashDB scenes to download must apply the blocklist the way
`blockedSets()` does. The deploy check tests the Unlisted hold.
