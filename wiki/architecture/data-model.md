---
title: Data model (Postgres)
kind: architecture
summary: The Postgres tables and what each holds, against the rule that Stash owns ratings, plays, resume points, markers and favourites; also the Stash tags flix creates.
tags: [postgres, drizzle, schema, data]
status: current
verified: 2026-11-10
updated: 2026-11-10
code: [apps/server/src/db/schema.ts, apps/server/drizzle]
related: [stash-owns-activity, postgres-cnpg, database-migrations, playlists-and-favorites, stations, blocklist-and-exclusions, stashdb-mirror, whisparr-sync]
---

# Data model (Postgres)

Postgres holds **only what Stash cannot** ([[stash-owns-activity]]). Stash keeps ratings,
play counts, resume points, O-counts, markers, performer/studio/tag favourites, titles and
tags, so its own UI stays consistent. Schema in `apps/server/src/db/schema.ts` (Drizzle);
migrations in `apps/server/drizzle/` (`0000` to `0012` on 2026-11-10), applied on boot
([[database-migrations]]).

## Tables

| Table | Holds | Notes |
|---|---|---|
| `playlists` | ordered lists | `kind = 'favorites'` marks the built-in Favorites list behind the heart on videos (Stash scenes have no favourite flag); unique on `kind` |
| `playlist_items` | `(playlist_id, scene_id)` with `position` | `scene_id` is Stash's id as text; cascade on playlist delete |
| `reels` | `id`, `name`, `transition` (cut or fade, the default between clips) | [[reels]]; behind `FLIX_REELS=1` |
| `reel_items` | `id`, `reel_id`, `scene_id`, `start_sec`, `end_sec`, `position`, `transition` (null follows the reel), `source_duration_sec` | a clip: a range of one video; cascade on reel delete; the stored length detects a changed file |
| `reel_builds` | `id`, `reel_id`, `status` (queued, building, done, failed), `now`, `plan_hash`, `plan` (jsonb), `progress`, `message`, `error`, `file`, `duration_sec`, `size_bytes`, the four timestamps | [[reel-builds]]: the queue the NAS builder claims from; only the newest row of a reel survives a finished build |
| `blocks` | the blocklist: `(kind ∈ tag/performer/studio, stash_id)` plus `name` at block time | what flix must not download; never applied to library lists. The name lets Settings render the list without Stash ([[blocklist-and-exclusions]]) |
| `unlisted` | Unlisted entities: `(kind ∈ tag/performer/studio, stash_id)` plus `name` when unlisted; independent of `blocks` (one entity may be in both) | since 2026-11-09 ([[vault]]); _`edu_tags` held the Edu categories that morning, migrated in `0008` and dropped in `0009`_ |
| `cast_overrides` | a video's cast set by hand: `scene_id` → `women`, `men`, `other`, `title` | the Cast sync files the video by these instead of performer genders ([[cast]], since 2026-11-09) |
| `studio_categories` | a studio's default categories: `(studio_id, tag_id)` plus both names | kept on the studio's own videos by the studio-defaults sync ([[studio-default-categories]], since 2026-11-09) |
| `studio_category_adds` | `(scene_id, tag_id)` the studio-defaults sync added | only these lose a category when it stops being a default ([[studio-defaults-stored-in-flix]]) |
| `settings` | `key → jsonb value` | small preferences shared across devices: per-studio intro skip, panic URL, `playOnOpen`, `people` defaults, `featured` weights, `whisparrSync` (the guard and discovery switch, [[whisparr-sync]]), `hideVr` (Discover), `continueDays` (Continue expiry, 30), `castSetup` (the Cast sync's one-time block was done) ([[settings-next-to-page]]). Since 2026-11-10 also the job registry's last runs as `job:<name>` → `{ lastRun }`, which `GET /api/settings` leaves out ([[server-bff]]); `performerGender` is still stored and accepted but read by nothing since 2026-10-31 (the switch is per browser, [[gender-switch-performers-page-only]]) |
| `saved_rows` | Browse filters pinned to Home as rows: `title`, `query` jsonb, `position` | [[home-feed]] |
| `stations` | named stations: `query` jsonb or `from_scene`, `mode` full/moments, `window` seconds, `position` | [[stations]] |
| `station_resume` | where a station was left: `key → scene_id, seconds` | key `id:<n>` (a saved station) or `pl:<n>` (a playlist) only; ad hoc keys are not saved since 2026-10-31 and any left are removed by the ghost sweep; newest 50 kept |
| `whisparr_gets` | Whisparr scenes flix fetched: `movie_id`, `at`, `searched_at` | the guard never unmonitors these; the row goes when the file arrives ([[whisparr-sync]]) |
| `whisparr_watch` | when a performer or studio (StashDB id) was first followed: `(kind, foreign_id)`, `since` | discovery fetches only releases after it, less 14 days |
| `get_queue` | StashDB scenes waiting for a paced Get: `stashdb_id`, `added_at`, `attempts`, `last_error` | one every 8 s, three attempts ([[stashdb-mirror]]) |
| `sdb_scenes`, `sdb_entities` | the StashDB mirror: scenes (ids, names, dates, performer and tag id arrays, cover URL, description) and performers, studios, tags by `(kind, id)` | what was followed, opened or searched, not a copy of StashDB ([[stashdb-mirror]]) |
| `sdb_scopes`, `sdb_queries` | which performer's or studio's catalogue is held whole and how far; one cached StashDB answer per exact query | searches unused for 30 days are pruned daily |

## Stash tags flix creates

- **Highlight**: the tag on markers created in flix (Stash requires a primary tag on every
  marker); created on first use ([[moments]]).
- **Not interested**: retired 2026-11-09 (Not interested deletes now). It hides nothing; Cleanup
  lists any video still carrying it, to delete or keep ([[blocklist-and-exclusions]]).
- **Cast** and its children (`Cast: F+M`, `Cast: Women 2+`, …): written to every video by the
  Cast sync from performer genders ([[cast]], since 2026-11-09).
- **Unlisted**: added to a video by "Unlist"; counts as an Unlisted category, so the video
  goes to the Vault and off Home; Settings lists them to undo ([[vault]], since 2026-11-09).

## Browser-side state (not in Postgres)

Per-browser preferences live in localStorage through `lib/storage.ts`: stacked Browse filters,
discreet mode, keep-playing, the PIN hash, the studios view, the hold hint counter. The private
session flag is in sessionStorage. See [[coding-conventions]] and the privacy pages.
