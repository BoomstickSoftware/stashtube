---
title: Web app
kind: architecture
summary: Layout of apps/web, which is Vite + React 19 + Tailwind 4 + TanStack Router and Query, with file-based routes, lazy pages, one API-hook module per domain and persisted queries.
tags: [web, react, vite, tanstack, routing]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [apps/web/src/routes, apps/web/src/lib/api/index.ts, apps/web/src/main.tsx, apps/web/vite.config.ts]
related: [shared-contract, mobile-first-ui, coding-conventions, caching, keyboard-shortcuts]
---

# Web app

`apps/web` is a Vite SPA: React 19, Tailwind 4, TanStack Router (file-based) and TanStack
Query. It imports only `@flix/shared` types ([[shared-contract]]) and talks only to the BFF.

## Routes (`src/routes/`, one file per path)

The TanStack router plugin (`@tanstack/router-plugin`, `autoCodeSplitting`) writes
`src/routeTree.gen.ts` (committed) and splits every page into its own chunk, loaded on intent.
Route files hold the search-param validation; the page component lives in `src/pages/`.
Naming: `scene.$id.tsx` is `/scene/:id`; `stations_.new.tsx` is `/stations/new` **outside**
the `/stations` layout (the trailing underscore). Routes on 2026-10-30: `index` (home),
`browse`, `scene.$id`, `performers`, `performer.$id`, `studios`, `studio.$id`, `tags`, `tag.$id`,
`playlists`, `playlist.$id`, `continue`, `history`, `stats`, `station`, `stations`,
`stations_.new`, `stations_.$id.edit`, `cleanup`, `duplicates`, `settings`, plus `__root`.

## API hooks (`src/lib/api/`)

One module per domain, re-exported by `index.ts`, so pages import from `'../lib/api'`:

| Module | Holds |
|---|---|
| `client.ts` | `fetch` wrapper, `ApiError`, `qs`, the `QueryClient`, `PERSISTED` keys; imports no domain module |
| `scenes.ts` | lists, one scene, search, rating/O/plays, hiding, edits, markers, history, delete |
| `people.ts` | performers, studios, tags, tiles, their favourites, blocklist, intro skip |
| `playlists.ts` | playlists, the Favorites heart, bulk actions |
| `stations.ts` | stations, resume, previews |
| `home.ts` | home rows, Featured preview, pinned rows |
| `settings.ts` | settings, features, admin cache, login |
| `whisparr.ts` | `useWanted`, `useWhisparrNew`, `useWhisparrActivity`, `useGetScene` |

## Helpers (`src/lib/`)

`storage.ts` (the only localStorage access), `playback.ts` (shared by both players),
`nowPlaying.ts` (mini-player store), `privacy.ts`, `lock.ts`, `filters.ts` (stacked filters per
browser), `describe.ts` (one `describeQuery` for chips, station summaries, row titles),
`station.ts`, `toast.ts`, `hooks.ts` (`useLongPress` and friends), `media.ts` (`mediaUrl()`),
`query.ts`, `format.ts`.

## Components (`src/components/`)

Layout, Player, SeekBar, SpriteThumb, PreviewVideo, SceneCard, SceneBrowser, Row, Filters,
AddFilter, People, QuerySummary, SearchBox, Bulk, CardMenu, PlaylistMenu, SceneEditor, Moments,
NowPlaying, Privacy, PinLock, DeleteScenes, WantedRow, EntityHeader, FeaturedDials, CachePanel,
Shortcuts, `ui.tsx` (primitives incl. `Switch`).

## Persisted queries

`main.tsx` persists the queries whose keys are in `PERSISTED` to localStorage `flix.queries`
(home feed, settings, favourites, playlists, blocklist, session) for up to 7 days: a cold open
paints at once, then refetches in the background ([[caching]]). Only the current Home seed's
feed is kept ([[home-feed]]).

Other defaults in `lib/api/client.ts`: stale queries refetch when the app returns to the
foreground (`refetchOnWindowFocus`; _off until 2026-10-31_); `scenes`, `scene` and `related`
stay 30 min in memory, so Back after watching a video finds the list and its scroll. Every
`ErrorBox` has **Try again**, which refetches the failed queries on screen (the installed app has
no reload button). A scene is prefetched on intent by its route's loader, and the page shows the
card a list already holds while the full record loads ([[scene-page]]). React Query is deduped in
`vite.config.ts` ([[vite-duplicate-react-query]]).

## Writes and freshness

Every mutation that fails shows a toast, once, from the `MutationCache` in `lib/api/client.ts`:
the `ApiError` message when the server passed a reason on ("Stash: database is locked"),
"Couldn't save that" otherwise. The cache's `onError` runs even for hooks with their own
`onError` (a per-hook `onError` would *replace* a `defaultOptions.mutations.onError`, which is
why the cache hook is used); a hook whose UI renders the error itself opts out with
`meta: { silent: true }` (`useDeleteScenes`). _Until 2026-10-31_ only Get, Delete, Settings and
the station editor surfaced a failed write. Rolling optimistic updates back on error is still
per hook and mostly missing ([[roadmap]], Phase 5).

What a write invalidates on the client beyond its own query (`lib/api/*.ts`):

- Block and Not interested: every list (`invalidateLists`: blocklist, scenes, home, performers,
  studios, tags, search, related), plus `hidden` and `scene:<id>`.
- Station add / update / remove / reorder: `stations` and `station-previews`; remove also
  `station-resume` ([[stations]]).
- Remove from history: `scenes`, `home` and `scene:<id>` (its view count and resume pill).
- Title or tag edit: `scene:<id>`, `scenes`, `home` (persisted) and `related`.
- Settings: `people` → everything but settings; `featured` → `home`; anything else → `search`.

The server side is in [[caching]]; the per-action freshness table from the 2026-10-31 audit is
`docs/audits/2026-10-31-ux/ia.md` §3.

## Checks

`pnpm --filter @flix/web lint` (oxlint), `pnpm typecheck`, `pnpm --filter @flix/web build`.
The main chunk was 256 kB + a 124 kB shared UI chunk after Round 4 (2026-10-29); `hls.js`
(574 kB) loads only for transcoded videos.
