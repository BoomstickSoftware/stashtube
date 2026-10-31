# flix UX audit: information architecture, workflow simplification, data freshness

Auditor lens: code-first and wiki-first. Read-only. Sources: `wiki/` (index, every `features/`, `architecture/{web-app,caching,data-model,blocklist-and-exclusions,mobile-first-ui}`, every `decisions/`, `roadmap`), `apps/web/src/{pages,components,lib,lib/api,routes}`, `apps/server/src/{api,index,stash (writes),blocklist,settings,rows,stations,playlists,delete,sweep,guard,config,whisparr,stashdb}`. One read-only probe: `GET http://flix.lan/api/features` → `{deleteScenes:true, whisparr:true, stashdb:true}`.

Date: 2026-10-31.

## 1. Executive summary

1. The app is coherent and small enough to hold in one head, but **four distinct concepts share the word "favourite"** (video heart = Postgres playlist, performer/studio Follow = Stash favourite, tag Pin = Stash favourite, and the `favorites` *filter* which means "performers I follow"), and the UI spells it both ways. That is the single biggest naming debt.
2. **Mutation failures are silent.** There is no global mutation error handler; of 25 write paths only Delete, Get, panic-URL and the station editor show an error. A failed rating or follow leaves its optimistic value on screen with no message.
3. **Freshness is good where it was engineered (hide, block, delete) and leaky where it was not**: progress bars on the list you came from lag one refetch, the Continue badge only updates on window focus, a new station's card has no preview for up to 10 min, Identify's result is lost if you leave the page, and a deleted playlist leaves a ghost "Everything" card in "Pick up a station" on Home.
4. **Three things live where nobody will find them**: library management (Clean up, Duplicates) behind a card at the top of Settings; the studio intro skip in the player's gear menu (the wiki says it is on the studio page); and the panic key, which has no touch equivalent on a phone-first app.
5. **Two destructive surprises**: Playlist "Shuffle" permanently rewrites the playlist's order (`Playlists.tsx:139`), and Block has no confirmation or Undo while "Not interested" has both.

## 2. Jobs to be done → flows

Taps are counted from the Home page on a phone unless stated. "Screens" are route pages plus modal sheets.

| Job | Entry points today | Current steps (phone) | Screens | Proposed steps | Remove / merge | Files |
|---|---|---|---|---|---|---|
| **Watch something new now** | Hero "Play"; any row card; Stations quick start | Hero: 1 tap (starts). Row card: tap → scene page opens *paused* (`playOnOpen` default false) → tap Play = 2 taps. Card long-press → "Play" = 2 taps. | Home, Scene | Keep. Make a card's long-press sheet lead with Play (it does). Consider `play=1` on Home-row card taps only, leaving Browse paused. | Nothing. | `pages/Home.tsx`, `components/SceneCard.tsx`, `routes/scene.$id.tsx` |
| **Resume what I was watching** | Continue tab (badge); Hero "Resume from…" when the pick has a resume point; mini-player dock; Home "Pick up a station" | Continue → card → auto-resume with 8 s "Resumed at · Start over" pill = 2 taps. Station: Home resume card = 1 tap. | Continue (tabs Continue/History/Stats), Scene | Keep. Fix badge freshness (§3 row 17). | The hero's "Resume from" duplicates Continue; harmless. | `pages/Continue.tsx`, `pages/History.tsx` (`WatchTabs`), `components/Layout.tsx:33` |
| **Find a specific scene / performer / studio** | Header search (icon on phone, `/` on desktop); Performers/Studios/Categories filter boxes; Filters dialog "Find" | Search: tap icon → type → tap hit = 3 steps. Directory: tab → type (client-side filter for studios/tags, server for performers). | Header, Directories | Keep header search as the one entry. The three directory filter boxes and the Filters dialog "Find" are four search UIs with different scopes; acceptable, but label the directory boxes "Filter" consistently (they are). | None required. | `components/SearchBox.tsx`, `pages/Directories.tsx:16`, `components/Filters.tsx:197` |
| **Explore a performer, decide what to get next** | Performer page → "Not in your library yet" shelf (Row/Grid) → Get | 1 tap on Get → toast "Getting …" → card's label updates after `['whisparr']` refetch. Grid view loads the whole catalogue by scroll. | Performer, (Studio) | Keep. Add a "Requested" state on the card between Get and Whisparr's grab (§3 row 18). | None. | `components/WantedRow.tsx:66-109`, `lib/api/whisparr.ts:48` |
| **Curate: favourite, playlist, rate, mark, hide, block** | Card heart / Save icon; card long-press sheet; scene page action row; Bulk bar; entity-page Block; Moments list | Heart 1 tap. Save → sheet → pick = 2 taps. Rate 1 tap. O 1 tap (also marks). Mark = hold picture. Hide = 1 tap + Undo toast. Block = 1 tap, no confirm, no Undo. Bulk: Select → tap cards → bar. | Scene, Browse, entity pages | Give Block the same Undo toast as Hide. Rename as in §4. Surface mutation errors (§3). | "Station from here" in the card sheet duplicates the scene page's Station link (open roadmap question). | `components/CardMenu.tsx`, `components/PlaylistMenu.tsx`, `components/EntityHeader.tsx:7`, `pages/Scene.tsx:132-182` |
| **Manage the library: duplicates, cleanup, identify, titles, tags** | Settings → "Clean up the library" card → chips → Duplicates link; scene page Identify / Edit title / Edit tags | Cleanup: Settings icon → card → list chip → tap cards → Delete → confirm = 5+ taps. Identify: scene page → fold → button. | Settings, Cleanup, Duplicates, Scene | Promote a "Library" group (Clean up, Duplicates, Blocklist, Not interested) to the top of Settings under one heading, or a `/library` hub linked from Settings. Keep Identify where it is. | Nothing. | `pages/Settings.tsx:28-37`, `pages/Cleanup.tsx`, `pages/Duplicates.tsx`, `components/SceneEditor.tsx` |
| **Set up a station, listen / watch in the background** | Stations (header radio icon on phone; nav on desktop); any list's "Station" chip; scene page "Station"; card sheet "Station from here"; playlist "Station"; Home resume cards | Quick start = 2 taps. From a list = Filters … → Station chip. Save: on the playing station → Save → name. Editor: Stations → New → name/mode/filters → Create and play. Sleep timer in-player. | Stations, Station (full-screen), StationEditor | Keep quick starts and the editor. Decide the open roadmap question: keep "Station" on lists and entity pages (it is the only way to turn a page's filters into a station), drop the card-sheet duplicate. The "Save" on an ad hoc station is the bridge to a saved one; keep. | Card-sheet "Station from here". | `pages/Stations.tsx`, `pages/Station.tsx:516`, `pages/StationEditor.tsx`, `components/SceneBrowser.tsx:210` |
| **Tune the feed: pinned rows, featured, affinities** | Browse filter bar "Pin to home"; Home pinned-row icons (rename/move/unpin, 60 % opacity until hover); Settings → Featured dials (live preview); Featured "Shuffle"; follows and ratings feed affinities | Pin: Browse → Filters → … → Pin to home → title → Pin row. Manage: on Home. Dials: Settings → drag. | Browse, Home, Settings | Keep. The row icons at 60 % opacity are fine on touch (always visible). | None. | `components/SceneBrowser.tsx:230`, `pages/Home.tsx:217`, `components/FeaturedDials.tsx` |
| **Configure** | Header gear → Settings (one long page: Clean up card, Blocklist, Not interested, Performer preferences, Featured, Playback, Panic key, Privacy, Cache, Keyboard, Diagnostics, Sign out) | Scroll. No section navigation. | Settings | Group into five headed sections with an anchor strip at the top: Library, Feed, Playback, Privacy, Advanced (Cache, Keyboard, Diagnostics). Keeps the one-page rule in [[settings-next-to-page]]. | Hide "Panic key" and "Keyboard" on `pointer: coarse` (no Esc, no keys); move Discreet into Privacy as a switch too. | `pages/Settings.tsx` |

## 3. Data freshness after actions

Client defaults (`lib/api/client.ts:49-73`): `staleTime` 30 s, `gcTime` 5 min, `refetchOnWindowFocus` true, retries 2 for 5xx/network; `scenes`/`scene`/`related` kept 30 min; `session`/`home`/`settings`/`favorite-scenes`/`playlists`/`blocklist` persisted to localStorage 7 days. Server (`stash.ts:120-132`, `caching.md`): every read cached 360 min then served stale up to 168 h; a write `invalidate`s its tags (dropped) and `expire`s others (served **once more** while refreshing); Stash-side changes caught by a 60 s poll while active.

"Stale window" = how long a user can see the old value on a screen that is *not* patched or invalidated: until that query's `staleTime` has passed **and** something triggers a refetch (mount of a component using it, window focus, or an invalidation by another action).

| # | Action (hook) | Optimistic? | Client invalidation | Server tags dropped / expired | Screens that still show the old value | Stale window | User notices? |
|---|---|---|---|---|---|---|---|
| 1 | Rate scene (`useRateScene`, `scenes.ts:115`) | Yes: `['scene',id]`, every `['scenes']` page, `['home']` rows | None on success; on **error** only `['scene',id]` | `scene` dropped; pool expired | Related row cards (`['related',id]`, 5 min), playlist detail cards, station previews, Duplicates | ≤5 min (related); 30 s + remount (others) | Rarely. **On failure the lists keep the wrong stars** (only the detail is reverted). |
| 2 | O counter (`useAddO`) + auto marker | On success patch `oCount`; marker via `useSceneEdits.addMarker` → invalidates `['scene',id]`,`['scenes']` | as left | `scene` dropped; `scene:<id>` | none meaningful | — | No. |
| 3 | Mark as watched (`useMarkWatched`) | Patch `playCount:1` | `['scenes']`, `['home']` | `scene:<id>` + `activity:play` dropped; `scene` **expired** | Home rows after the refetch: the server serves the **expired** copy once more, so Discover/Unwatched-style rows keep the card until the *second* refetch | one extra refetch cycle (≥30 s) | Yes, mildly: the card you just marked stays in "Discover" for a while. |
| 4 | Not interested / Show again (`useHideScene`) | No | `invalidateLists()` (blocklist, scenes, home, performers, studios, tags, search, related) + `['hidden']` + `['scene',id]` | `scene`,`tag` dropped (it is a tag edit) | `station-previews` (10 min), `station-resume` (30 s), `duplicates` | ≤10 min on Stations cards | Barely. The card lingers until the round trip; the toast covers it. |
| 5 | Block / unblock (`useBlock`) | No | `invalidateLists()` | None in Stash's cache (exclusions are part of each query key, so new keys are built; entity lists are filtered post-query) | Same as 4; the Block button flips only after `['blocklist']` refetches | round trip; ≤10 min on Stations cards | Barely. No Undo and no confirm (contrast with Hide). |
| 6 | Heart a video (`useToggleFavoriteScene`) | Yes (`favorite-scenes` set) | onSettled: `favorite-scenes`, `playlists`, `playlist`, `scene-playlists:id` | Postgres only | none | — | No. |
| 7 | Playlist add/remove/create/rename/delete/reorder (`usePlaylistMutations`) | Reorder only | `playlists`, `playlist:id`, `scene:id`, `scene-playlists:id`, `favorite-scenes` | Postgres only | **Delete**: `['playlist',id]` is not invalidated (id is undefined in `refresh()`), and the server leaves the `pl:<id>` row in `station_resume` (`playlists.ts:66` deletes only `playlists`; `sweep.ts` removes ghost *scenes*, not ghost playlists). `listResume` finds no name → Home's card label falls to `QuerySummary({playlist:N})` = **"Everything"** → tap → "That playlist no longer exists." | until the resume row ages out of the newest 50 | **Yes.** A phantom "Everything" station on Home after deleting a playlist you had played as a station. |
| 8 | Bulk favourite / add to playlist (`useBulk`) | No | `playlists`, `playlist`, `favorite-scenes`, `scene-playlists` | Postgres | none | — | No. |
| 9 | Follow performer (`useFavoritePerformer`) | Yes: detail + `['performers']` pages | onSettled `['home']` only | `performer`,`scene` dropped | `['whisparr','new']` (60 s), Stats top performers, Search results carry no flag. **On error nothing reverts** except via the Home refetch. | ≤60 s | Rarely. |
| 10 | Follow studio (`useFavoriteStudio`) | Yes: `['studio',id]` only | None | `studio` dropped | Studios directory `['studios']` (the "Following" chip filters on `s.favorite`; only the Table view patches it, `Directories.tsx:287`) | 30 s + remount | Sometimes: follow on a studio page, go straight to Studios → Following: it is missing for up to 30 s. |
| 11 | Pin tag (`useFavoriteTag`) | Yes: tiles + tag | onSettled `['tags','tiles']` | `tag` dropped | none | — | No. |
| 12 | Rate performer (`useRatePerformer`) | `['performer',id]` only | None | `performer` dropped | Performers directory cards show `p.rating` | 30 s + remount | Rarely. |
| 13 | Markers add/edit/delete (`useSceneEdits`) | No | `['scene',id]`, `['scenes']` | `scene:<id>` | none (seek-bar ticks and Moments come from `scene`) | round trip | No. Delete shows an Undo toast **even if the delete failed** (no `onError`). |
| 14 | Title / tag edit (`useSceneEdits.update`) | No | `['scene',id]`, `['scenes']` | `scene`,`tag` dropped | `['home']` rows (persisted!), `['related',*]`, playlist detail, History, Search results, Categories tiles' counts (5 min) | 30 s + remount (home); ≤5 min (tiles) | Yes: rename a video, tap Home within 30 s → old title in the rows. |
| 15 | Identify (`identify` + `useJob`) | — | On job FINISHED: `['scene',id]`, `['scenes']`, `['home']` — **only while `IdentifyButton` is mounted** | `jobStatus()` drops `scene`,`performer`,`studio`,`tag` **only when polled**; otherwise the 60 s change poll expires everything (served stale once more) | Everything, if you leave the scene page before the job ends: nothing on the client is invalidated and the server waits for the poll | up to 60 s + one stale serve + 30 s client staleTime | **Yes.** Identify, go back to the list, come back: old title and no performers for a minute or two. |
| 16 | Settings (`useUpdateSettings`) | Yes | `people` → everything but settings; `featured` → home; **anything else → `['search']` only** | settings cache cleared | `performerGender` (changed from the Performers page switch): `['home']` (persisted), `['scenes','stats']`, `['performers']` refetches only because `gender` is in its key | 30 s + remount | Yes: switch Women→Men, tap Home: the feed is still the old one. Stats too. |
| 17 | Watch accounting (`addPlay`, `saveActivity`, every 15 s) | — | **None** | `scene:<id>` + `activity:play/resume` dropped; `scene` **expired** | The list you came from: its first refetch after Back gets the server's expired copy once more, so the card's progress bar / "New" badge / views lag **one refetch behind**. Continue badge (`['scenes','continue-count']`, 60 s) lives in `Layout`, which never remounts → it only refreshes on window focus or when another mutation touches `['scenes']`. Home "Because you watched" row: 30 s + remount. | one refetch cycle; badge until next focus | **Yes.** Watch half a video, Back: no progress bar on its card; the Continue count in the tab bar does not move until you leave and return to the app. |
| 18 | Whisparr Get (`useGetScene`) | No | `['whisparr']` | `whisparr` dropped (`whisparr.ts:237,278`) | Fresh after refetch, but the card has only Whisparr's states: if Whisparr has not grabbed yet the card shows **Get again** ("available"), as if nothing happened | until Whisparr grabs | Yes, mildly: the toast says "Getting", the card says "Get". |
| 19 | Pinned rows pin/rename/move/unpin (`useRowMutations`) | No | `['home']`, `['rows']` | Postgres | Home rebuilds the whole feed per change (0.04 s with the pool cached, up to ~1 s) | round trip | Barely: a rename shows the old title until the feed returns. |
| 20 | Stations add/update/remove/reorder (`useStationMutations`) | update/remove yes | `['stations']` | Postgres | `['station-previews']` (**10 min** staleTime, key unchanged): a new or edited station's card has no count and no cycling screenshots; `['station-resume']` after remove (30 s) → the deleted station can still sit in Home's "Pick up a station" | ≤10 min / ≤30 s | **Yes.** Create a station → its card is a plain cover with no "N videos" badge until you come back later. |
| 21 | Station resume save (`saveStationResume`) | — | `['station-resume']` | Postgres | none | — | No. |
| 22 | Delete scene (`useDeleteScenes`) | — | Everything except the gone scene's own `scene`/`related` (marked stale, not refetched) | Whisparr + Stash + playlists | none | — | No. Exemplary. |
| 23 | Remove from history (`useRemoveFromHistory`) | Yes (history list) | onSettled `['scenes']`, `['home']` | `scene` dropped (play count and resume reset) | `['scene',id]` (not invalidated; gc 30 min, stale 30 s): open the video within 30 s → "N views" and the **resume pill still resume at the cleared spot** | 30 s | Yes, if quick. |
| 24 | Intro skip (`useIntroSkip`, player gear) | No; settings replaced on success | none needed | settings | none | — | No. |
| 25 | Cache clear/warm (Settings) | — | all / `cache-stats` | all | none | — | No. |

Server-only freshness worth knowing: a Stash scan or edit made in Stash's UI reaches flix within 60 s **only while flix has been used in the last 10 min** (`CHANGE_POLL_SECONDS`, idle gate in `stash.ts:210`); the first page view after a long idle is served from a snapshot up to 168 h old and refreshed behind. The Cache panel in Settings says "within 60 s" without the idle caveat (`CachePanel.tsx:29`).

## 4. Findings, ranked by user impact

### F1. Silent write failures
- **Evidence**: `lib/api/client.ts:49` sets no `mutations` defaults; only `WantedRow.tsx:88`, `DeleteScenes.tsx:115`, `Settings.tsx:257`, `StationEditor.tsx:137` surface a mutation error. `useRateScene` reverts only the detail on error (`scenes.ts:120`); `useFavoritePerformer`/`useFavoriteStudio`/`useFavoriteTag`/`useRatePerformer` have no `onError`; `Moments.tsx:56` shows "Removed the moment … Undo" before the delete has answered.
- **Why the user feels it**: with Stash locked by a scan (`stash-database-locked`), a tap on stars, heart, Follow, Block, Save-to-playlist or Pin does nothing or shows a value that is not saved, with no message. On a phone there is no console to check.
- **Proposed**: add `defaultOptions.mutations.onError` in `client.ts` that shows a toast with `ApiError.message` ("Stash: database is locked", "Whisparr: no answer in 30 s") and, for the optimistic hooks, an `onError` that reverts (`patchScene` back to the previous value captured in `onMutate`'s context). Move the Moments Undo toast to `onSuccess`.
- **Effort**: S (toast) + M (rollbacks). **Confidence**: high.

### F2. Four concepts called "favourite", spelt two ways
- **Evidence**: video heart = Favorites playlist (`PlaylistMenu.tsx:121`, "Favorite/Favorited"); performer/studio "Follow/Following" = Stash favourite (`EntityHeader.tsx:21`); tag "Pin/Pinned" = Stash favourite (`Tag.tsx:33`); `SceneQuery.favorites` = "Only videos with a performer I follow" (`Filters.tsx:122`) but its chip reads "Favourite performers" (`describe.ts:45`), the quick start is "Favourite performers" (`Stations.tsx:20`), the Home row is "New from your favourites" (`api.ts:211`). UK spelling in `describe.ts`, `Stations.tsx`, `Privacy.tsx:20`, Home titles; US spelling on every button. The wiki uses "favourite" throughout.
- **Why**: "Favourite performers" station plays videos of people you *follow*, not of videos you hearted; a user who hearts videos expects the opposite.
- **Proposed**: one vocabulary. Video heart → "Favorites" (keep). Performer/studio → "Follow" (keep). Tag → "Pin" (keep). Everything derived from Stash's performer favourite → "Following": filter toggle "Performers I follow", chip "Following", quick start "Performers I follow", Home rows "New from performers you follow" / "…not downloaded". Pick one spelling for the UI (US, since every button already uses it) and keep UK in the wiki if you like.
- **Files**: `lib/describe.ts:45`, `pages/Stations.tsx:20`, `apps/server/src/api.ts:211`, `components/WantedRow.tsx` callers in `Home.tsx:81`, `components/Privacy.tsx:20`, `components/Filters.tsx:123`.
- **Effort**: S. **Confidence**: high.

### F3. Progress and the Continue badge lag after watching
- **Evidence**: table rows 17 and 23. `useWatchAccounting` (`lib/playback.ts:79`) invalidates nothing client-side; the server `expire`s the `scene` tag so the next list refetch is served stale once (`stash.ts:671`, `caching.md` "served once more while it refreshes"); `useContinueCount` lives in `Layout` (`Layout.tsx:33`) with `staleTime` 60 s and no invalidation from playback.
- **Why**: the most common loop on a phone is watch → Back → the card you just watched shows no progress bar; the tab-bar dot does not change.
- **Proposed**: in `useWatchAccounting.flush`, after a successful `saveActivity`, `patchScene(qc, id, { resumeTime, playCount })` into `['scene',id]`, `['scenes']` pages and `['home']` rows (same helper the rating uses), and `invalidateQueries(['scenes','continue-count'])` when the resume point crosses 0 either way. No server change needed; the optimistic patch hides the one stale serve.
- **Files**: `lib/playback.ts`, `lib/api/scenes.ts` (`patchScene` is module-private; export it).
- **Effort**: S. **Confidence**: high.

### F4. Ghost "Everything" station on Home after deleting a playlist
- **Evidence**: `playlists.ts:66` deletes the playlist only; `stations.ts:107` lists every `station_resume` row and resolves names from `playlists` (`resumeNames`), so a `pl:<id>` row for a deleted playlist comes back with `name: null`; `Home.tsx:113` then labels it `QuerySummary(stationSearchFor('pl:N'))` → `{playlist:N}` has no parts → `empty="Everything"`; tapping it → `Station.tsx:101` "That playlist no longer exists." `sweep.ts` only removes rows whose *scene* is gone.
- **Proposed**: `deletePlaylist` also deletes `station_resume where key = 'pl:<id>'` (mirror of `deleteStation`, `stations.ts:54`); `listResume` drops rows whose name cannot be resolved for `id:`/`pl:` keys.
- **Effort**: S. **Confidence**: high (from code; not reproduced live).

### F5. Playlist "Shuffle" permanently rewrites the order
- **Evidence**: `Playlists.tsx:139-145`: `m.reorder.mutate({ id, sceneIds: shuffled }, { onSuccess: () => play(shuffled[0]) })`.
- **Why**: a hand-ordered playlist (the one thing the user curates by position, per `playlists-ignore-blocklist`) is destroyed by a button that reads like "play shuffled".
- **Proposed**: Shuffle should start the playlist station with a shuffled queue (`/station?playlist=N&shuffle=1`, `StationQueue.fill` already handles the playlist case) or navigate to the first of a client-side shuffled queue without writing. If the write is wanted, name it "Reorder randomly" and confirm.
- **Effort**: S. **Confidence**: high.

### F6. Identify's result is lost if you leave the page
- **Evidence**: table row 15; `SceneEditor.tsx:127` invalidates only while mounted; `stash.ts:978` drops server tags only inside `jobStatus()`, which is only called by the poll.
- **Proposed**: have the server remember identify job ids it started and, in the change poll (or a 2 s follow-up timer), call `jobStatus` for them until finished, so the server cache is dropped regardless of the client. On the client, keep the job id in a module-level map so the next scene-page mount resumes polling.
- **Files**: `apps/server/src/stash.ts` (`identifyScene`, `jobStatus`), `components/SceneEditor.tsx`.
- **Effort**: M. **Confidence**: high.

### F7. Gender switch on the Performers page silently changes Home, Stats, search and every People filter, and Home does not refresh
- **Evidence**: `Directories.tsx:53` saves `performerGender` globally (`people-pages.md` documents the reach); `settings.ts:19` on any patch other than `people`/`featured` invalidates only `['search']`; Home is persisted.
- **Proposed**: in `useUpdateSettings.onSuccess`, treat `performerGender` like `people` (invalidate everything but settings). Add a one-line caption under the switch: "Also sets who appears on Home, in search and in Stats." The decision [[settings-next-to-page]] allows the control to stay on the page.
- **Effort**: S. **Confidence**: high.

### F8. Station cards go blank for up to 10 minutes after creating or editing a station
- **Evidence**: `stations.ts` (web) `useStationPreviews` key `['station-previews', day, keys]` with `staleTime` 10 min; `useStationMutations.done` invalidates only `['stations']`.
- **Proposed**: `done()` also invalidates `['station-previews']`; on remove, invalidate `['station-resume']`.
- **Effort**: S. **Confidence**: high.

### F9. Library management is buried in Settings, and Settings is an 11-section scroll
- **Evidence**: `Settings.tsx:28-100`: Clean up card, Blocklist, Not interested, Performer preferences, Featured, Playback, Panic, Privacy, Cache, Keyboard, Diagnostics, Sign out, in one column with no anchors. Cleanup (`/cleanup`) and Duplicates (`/duplicates`) have no other entry.
- **Proposed**: five headed groups with a sticky chip strip at the top (Library · Feed · Playback · Privacy · Advanced). Library = Clean up, Duplicates, Blocklist, Not interested. Feed = Performer preferences, Featured. Playback = the two switches. Privacy = Private session, Discreet (add the switch; today it is header-only), PIN. Advanced = Panic key (desktop only), Cache, Keyboard (desktop only), Diagnostics. One page, so [[settings-next-to-page]] is untouched.
- **Effort**: M. **Confidence**: medium (taste).

### F10. The panic key has no touch equivalent
- **Evidence**: `Layout.tsx:187` `usePanicKey` listens for Esc Esc only; `Settings.tsx:227` shows the setting on phones.
- **Proposed**: either a touch trigger (a three-finger tap or a long press on the flix logo, both unused today) or hide the section on `pointer: coarse` and say so in the wiki. The private session, discreet mode and PIN cover the phone already; this may simply be a desktop feature.
- **Effort**: S. **Confidence**: medium.

### F11. Block has no confirmation and no Undo; Hide has both
- **Evidence**: `EntityHeader.tsx:7-19` (one tap, `block.mutate`); `CardMenu.tsx:91-99` and `Scene.tsx:151-171` (toast with Undo for Hide).
- **Why**: a mis-tap on a performer page empties them from Home, search and every list, and the only way back is Settings → Blocklist.
- **Proposed**: same toast pattern: "Blocked <name> everywhere · Undo".
- **Effort**: S. **Confidence**: high.

### F12. "Categories" vs "Tags"
- **Evidence**: nav and page title "Categories" (`Layout.tsx:25`, `Directories.tsx:413`) but the filter box on that page says "Filter tags" (`:414`), the tag page shows "#", search results say "Tag", the Filters dialog says "Tags", Settings Blocklist says "Tags", the scene page says "Edit tags".
- **Proposed**: pick one. "Tags" matches Stash, StashDB and every other label; "Categories" is the tube-site word. If Categories stays, the filter box and the pinned heading should say Categories too.
- **Effort**: S. **Confidence**: high.

### F13. "Not interested" vs "Hidden"
- **Evidence**: button "Not interested" → pressed state "Hidden" (`Scene.tsx:170`), toast "Hidden from flix", Settings section "Not interested", query key `hidden`, API `/scenes/:id/hidden`, Stash tag "Not interested".
- **Proposed**: the pressed state reads "Not interested ✓" (or "Marked not interested") and the toast "Marked not interested · Undo". Keep the API.
- **Effort**: S. **Confidence**: high.

### F14. Wiki drift found while reading (cannot fix in a read-only audit)
- `features/scene-page.md` lists **Mark as watched** on the scene page; `pages/Scene.tsx` has none (it exists only in the card sheet, `CardMenu.tsx:90`).
- `decisions/settings-next-to-page.md` and `features/people-pages.md` say the studio **intro skip is set on the studio page**; it is set in the player's gear menu (`Player.tsx:798-820`); `pages/Studio.tsx` has no such control.
- `lib/api/whisparr.ts:35` `useWhisparrActivity` is exported and polls every 30 s if used, but no component uses it (dead code; the wiki says `/api/whisparr/activity` "shows the queue").
- `CachePanel.tsx:29` "within 60 s of a change made in Stash" omits the 10-minute idle gate (`stash.ts:210`).

### F15. Error messages are raw and not actionable
- **Evidence**: `ui.tsx:151` `ErrorBox` prints `error.message` + Try again. Server messages: "Stash: no answer in 60 s", "Stash: Stash HTTP 500: …", "internal error" (`index.ts:78-87`); a network failure on Safari prints "Load failed"; the client aborts at 45 s (`client.ts:16`) while the server waits 60 s for Stash, so a slow Stash shows "signal timed out" rather than the server's message.
- **Proposed**: map in `ErrorBox`: `ApiError` 502 starting "Stash:" → "Stash is busy or down (a scan locks it for a few minutes). Cached pages still work."; `TypeError`/`AbortError` → "No connection to flix. Check Wi-Fi, then Try again."; 401 handled already. Lower the client timeout below the server's or raise the server's budget so the server's reason wins. A thin header status ("Stash is busy") driven by the last 502 would explain silent write failures too.
- **Effort**: S. **Confidence**: high.

### F16. A video whose file is missing or unplayable spins forever (verify)
- **Evidence**: `Player.tsx:568` `onError` only handles `mode === 'direct'` → sets `fallback` → HLS; an HLS error has no handler; `waiting` renders a spinner (`:600`). The station player does handle it (`Station.tsx:273`: fall back, then skip). `/media/play/:id` with a missing NFS file falls through to Stash's stream (`media.ts:102`).
- **Proposed**: on an HLS `error` (or hls.js fatal), show "Can't play this file" with "Try the transcode again" and, when `features.deleteScenes`, "Delete…". Needs a live check with a renamed file.
- **Effort**: S. **Confidence**: medium (not reproduced).

### F17. Discoverability of gesture-only and keyboard-only features
Keys from `Shortcuts.tsx` and handlers, with the phone's equivalent:

| Feature | Trigger | Phone exposes it? |
|---|---|---|
| Search | `/` | Header icon ✓ |
| Shortcuts list | `?` | Settings → Keyboard (useless on a phone) |
| Lock | `L` | Settings → Privacy → Lock now ✓ (idle/return lock automatic) |
| Panic | `Esc Esc` | **No** (F10) |
| Play/pause, ±5 s, ±10 s | Space/k, arrows, j/l | Tap, double-tap thirds (+10/−10), centre buttons ✓ (double-tap undocumented) |
| Jump to tenth | 0–9 | No (acceptable) |
| Volume, mute | ↑↓, m | iOS hardware volume; slider hidden on touch ✓ |
| Speed | < > | Gear menu ✓ |
| Fullscreen, theater, PiP | f, t, i | Buttons ✓ (theater hidden on phones by design) |
| Next video | Shift+N | Up next list, autoplay countdown ✓ |
| Mark moment | b | Hold the picture ✓ (hint for the first 3 videos) |
| Prev/next marker | [ ] | Tick taps on the seek bar, Moments list ✓ |
| Station next/prev/list/leave | n/p, q, Esc | Buttons ✓ |
| Card menu | right-click (desktop) | Long press ✓ (undocumented, no hint; desktop right-click is also undocumented) |
| Card preview | hover (desktop) | 10 px drag ✓ (undocumented) |
| Scrub by swiping the picture | — | ✓ (undocumented) |
| Hero carousel | arrows (hover-only) | Swipe ✓ |

Only the panic key lacks a touch path. The undocumented gestures (long-press menu, drag-to-preview, swipe-scrub, double-tap seek) could share the hold-hint mechanism: one rotating hint on the first few videos, counter in `flix.hint.*`.

### F18. Invisible global filter: Performer preferences
- **Evidence**: Settings `people` (age/ethnicity) applies to every list, Home and related (`blocklist.ts:26`), but `ActiveFilters` shows only the query's own parts and the Filters button count excludes it (`Filters.tsx:26`, `filters.ts:73`).
- **Proposed**: when `settings.people` is non-empty and the list has no own People filter and `unblocked` is off, show a dim chip "Your performer defaults · 25–35" linking to Settings, so an unexpectedly short list is explained.
- **Effort**: S. **Confidence**: high.

### F19. Three "Save"s and two "Shuffle"s
- "Save" = save to playlist (scene page button, `PlaylistMenu.tsx:64`), save a station (`Station.tsx:521`), save a title/pin row. "Shuffle" = Featured reshuffle (Home), Browse random reseed ("Reshuffle"), station fresh start, playlist reorder (F5).
- **Proposed**: scene page button "Playlist" (icon ListPlus already says it) and station "Save station". Playlist Shuffle per F5.
- **Effort**: S. **Confidence**: medium.

### F20. Studios page carries three views where one would do
- **Evidence**: `Directories.tsx:140-298`: Networks, Grid, Table, each with its own sort state, remembered per browser; only Table has follow hearts; Networks already flattens to a grid when you type.
- **Proposed**: Networks (default, with the text filter flattening it) plus Table (the dense, sortable, follow-able view). Drop Grid.
- **Effort**: S. **Confidence**: medium (taste; check with use).

## 5. Quick wins (each ≤ 1 hour, no decision reopened)

1. Global mutation error toast in `client.ts` (F1, first half).
2. `useStationMutations.done` → also invalidate `station-previews` and `station-resume` (F8).
3. `useUpdateSettings`: treat `performerGender` like `people` (F7).
4. `useRemoveFromHistory.onSettled` → also invalidate `['scene', id]` (row 23).
5. `useSceneEdits.update` → also invalidate `['home']` and `['related']` (row 14).
6. `deletePlaylist` deletes its `pl:<id>` resume row; `listResume` drops unnamed `id:`/`pl:` rows (F4).
7. Block button: Undo toast like Hide (F11).
8. "Hidden" pressed label → "Not interested ✓" (F13); "Filter tags" → "Filter categories" or rename the nav (F12).
9. `describe.ts:45`, `Stations.tsx:20`, `api.ts:211`: "Favourite performers" → "Following"/"Performers I follow" (F2 minimal cut).
10. Remove `useWhisparrActivity` or wire it to the Get card as a "Requested" state (row 18).
11. Hide Panic key and Keyboard sections on `pointer: coarse` (F10 minimal cut).
12. Fix the four wiki lines in F14 and add the idle caveat to `CachePanel.tsx:29`.

## 6. Open questions for the user

1. **Vocabulary**: "Categories" or "Tags"? "Favorites" (US) everywhere in the UI, with the wiki staying UK?
2. **Playlist Shuffle**: should it ever rewrite the stored order, or only play shuffled (F5)?
3. **Ad hoc Station entry points** (open in `roadmap.md`): keep the "Station" chip on lists and entity pages and drop the card-sheet "Station from here"? Or keep all three?
4. **Panic key on phones**: add a touch gesture, or declare it desktop-only?
5. **Library hub**: is a "Library" group at the top of Settings enough, or do you want Clean up / Duplicates / Blocklist / Not interested as their own page reachable from the nav (one more icon in an already full tab bar)?
6. **Gender switch placement**: fine on the Performers page with a caption, or should it move to Settings → Feed now that it steers Home and Stats?
7. **Error tone**: do you want a persistent "Stash is busy" header pill during scans (reads keep working from cache; writes fail), or just the toast on a failed write?
8. **Studios views**: can Grid go (F20)?
