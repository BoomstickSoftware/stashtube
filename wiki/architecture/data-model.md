---
title: Data model (Postgres)
kind: architecture
summary: The Postgres tables and what each holds, against the rule that Stash owns ratings, plays, resume points, markers and favourites; also the two Stash tags flix creates.
tags: [postgres, drizzle, schema, data]
status: current
verified: 2026-10-30
updated: 2026-11-09
code: [apps/server/src/db/schema.ts, apps/server/drizzle]
related: [stash-owns-activity, postgres-cnpg, database-migrations, playlists-and-favorites, stations, blocklist-and-exclusions]
---

# Data model (Postgres)

Postgres holds **only what Stash cannot** ([[stash-owns-activity]]). Stash keeps ratings,
play counts, resume points, O-counts, markers, performer/studio/tag favourites, titles and
tags, so its own UI stays consistent. Schema in `apps/server/src/db/schema.ts` (Drizzle);
migrations in `apps/server/drizzle/`, applied on boot ([[database-migrations]]).

## Tables

| Table | Holds | Notes |
|---|---|---|
| `playlists` | ordered lists | `kind = 'favorites'` marks the built-in Favorites list behind the heart on videos (Stash scenes have no favourite flag); unique on `kind` |
| `playlist_items` | `(playlist_id, scene_id)` with `position` | `scene_id` is Stash's id as text; cascade on playlist delete |
| `blocks` | the blocklist: `(kind ∈ tag/performer/studio, stash_id)` plus `name` at block time | the name lets Settings render the list without Stash ([[blocklist-and-exclusions]]) |
| `edu_tags` | the Edu section's categories: `stash_id` plus `name` when added | since 2026-11-09 ([[edu-section]]) |
| `settings` | `key → jsonb value` | small preferences shared across devices: per-studio intro skip, panic URL, `playOnOpen`, `people` defaults, `featured` weights ([[settings-next-to-page]]); `performerGender` is still stored and accepted but read by nothing since 2026-10-31 (the switch is per browser, [[gender-switch-performers-page-only]]) |
| `saved_rows` | Browse filters pinned to Home as rows: `title`, `query` jsonb, `position` | [[home-feed]] |
| `stations` | named stations: `query` jsonb or `from_scene`, `mode` full/moments, `window` seconds, `position` | [[stations]] |
| `station_resume` | where a station was left: `key → scene_id, seconds` | key `id:<n>` (saved), `q:<filters>` (ad hoc), `from:<scene>` (drifting); newest 50 kept |

## Stash tags flix creates

- **Highlight**: the tag on markers created in flix (Stash requires a primary tag on every
  marker); created on first use ([[moments]]).
- **Not interested**: added to a video by "Not interested"; `exclusions()` treats it as blocked,
  so the video leaves every list; Settings lists them to undo ([[blocklist-and-exclusions]]).

## Browser-side state (not in Postgres)

Per-browser preferences live in localStorage through `lib/storage.ts`: stacked Browse filters,
discreet mode, keep-playing, the PIN hash, the studios view, the hold hint counter. The private
session flag is in sessionStorage. See [[coding-conventions]] and the privacy pages.
