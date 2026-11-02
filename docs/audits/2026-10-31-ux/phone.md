# flix phone UX audit: user flows, friction, touch ergonomics

Date: 2026-10-31. Lens: phone user flows (iPhone, home-screen app). Driven headless against the running Vite at
http://localhost:5174 with the repo's `mobile-check.mjs`, `mini-check.mjs` and a new step-driven CDP script
(`phone-flow.mjs`, see end). Viewport 440×956 portrait and 932×430 landscape, touch emulation, write routes blocked.
All screenshot paths below are relative to
`(scratch)/audit/phone/`.
Code references are `apps/web/src/...` unless stated.

## 1. Executive summary

1. The core loops work and feel native: tab bar, cards, bottom sheets for filters and long-press, the docked mini-player (all three restore paths pass, `runD/`), no horizontal overflow on any of the 18 portrait pages (`r1/`).
2. Two outright phone bugs: in landscape the header's Settings gear (and most of the Private button) is pushed off the right edge and unreachable (`runE/home.png`), and on Browse the "Pin to home" popover is painted behind the first card so its input is unreadable (`runA/browse_pin_popover.png`).
3. The biggest flow cost is vertical: the list filter bar wraps to three rows (~290 px) on every list, and on Performer/Studio pages the "Not in your library yet" shelf sits above it, so the user's own videos start more than a screen down (`r1/performer_447.png`, `r1/studio_6.png`).
4. Discoverability gaps: the long-press card sheet is invisible until found, lacks "Save to playlist" yet offers "Delete…"; five header icons, the "+" chips, the droplet counter and the row/grid toggle carry no label on touch, where `title=` tooltips never show.
5. Touch targets are systematically under 44 px: header icons 36, card heart/save 30, stars 22, "+" 24, title pencil 16, filter chips 28 tall, sort select 24 tall, history "×" 32 (measured per page by `phone-flow.mjs --targets`).

## 2. Screen-by-screen notes

**Header and tab bar** (`r1/home.png`). Header: logo + five icon-only buttons (Search, Stations, Discreet eye, Private ghost, Settings), each 36×36, no labels, `Layout.tsx:106-139`. Tab bar: seven tabs at 10 px labels, each ~63×53; the Continue dot and Browse count badge are the only state. Landscape (`runE/home.png`, `runE/browse.png`): the `md:` desktop nav appears at 932 px alongside the search box and the icons; measured positions: Discreet 847–883, Private 899–935, Settings 951–987 with viewport 932, so Settings is fully clipped by the layout root's `overflow-x-clip` (`Layout.tsx:84`). `mobile-check` flags the same elements as offenders.

**Home** (`r1/home.png`, `runC/home_rows.png`, `runC/home_rows2.png`, `runC/home_rows3.png`). Hero at ~55svh with visible arrows, "Tonight's pick", a white Play pill that reads "Resume from…" when applicable (`Home.tsx:200-208`). Then "Pick up a station", then rows: Featured (Shuffle icon 27×27, no label), For you, Because you watched…, Top rated, Latest releases, Most watched, More with <performer>. Cards are 78vw so one card plus a sliver of the next shows per row; one row ≈ 55% of a screen. "See all" is visible on touch (good, `Row.tsx:19`). There is no "Continue watching" row on Home; resuming means the Continue tab. After visiting `/browse?tags=25&performers=447`, Home shows a "2" badge on the Browse tab with nothing explaining it (`runA/home_after_stacked.png`).

**Browse** (`r1/browse.png`). Filter bar wraps: row 1 Filters + sort select, row 2 Select / Pin to home / Station, row 3 count; ~290 px before the first card. Chips are 28 px tall, sort `<select>` 24 px tall (`SceneBrowser.tsx:170-199`). One card per row; thumbnail 408×230, meta block with heart and save icons at 30×30 right-aligned (`SceneCard.tsx:276-279`). Filters sheet (`runA/browse_filters_sheet.png`, scrolled `…_scrolled.png`): full-screen, clear title, X close 36×36, "Show 2,585 videos" footer with live count, good. But 24 popular-tag chips push Watched/Rating/Quality/Length below the fold; the second screenshot shows counts arriving late so chips re-layout after open (`Filters.tsx:280-300`). Long-press sheet (`runA/browse_longpress_sheet.png`): title + Play, Station from here, Add to Favorites, Mark as watched, Not interested, Delete…; no Save to playlist (`CardMenu.tsx:97-110`). Card save menu (`runA/browse_card_playlist_menu.png`): 288 px anchored popover with checkbox rows and "New playlist" field; works, 2 taps. Empty result (`runA/browse_empty.png`): "Nothing matches these filters." centred with no action; the removable chip sits at the top. Stacked filters (`runA/browse_stacked.png`): chips "<performer> ×", "Blowjob ×", "Clear all", Filters badge 2, tab badge 2: clear. Pin popover (`runA/browse_pin_popover.png`): `fixed top-32 right-4 z-50` rendered inside the filter bar (`SceneBrowser.tsx:252`); the first card paints over it, cutting off the title input.

**Scene** (`r1/scene_2775.png`, `runB/scene_full.png`). Paused chrome: back 10 / play / forward 10 rounds, the hint pill "Hold the picture to mark a moment" overlapping the rounds and the seek bar, bottom row Play, Next, Mute, time, Settings, PiP, Fullscreen (all 36×36). Below: title with a 16×16 pencil, studio + "+" (24×24, aria "Add <studio> to Browse filters"), action row Stars (22 px each) · droplet "0" · Favorite · Not interested · Delete (red) · Save; performers with "+" badges; then the same hold hint again as body text (`Moments.tsx:27`); then a details card whose meta line ends in an unlabeled code "260144" (`Scene.tsx:236`). Settings menu (`runB/scene_player_settings.png`): a 240 px popover inside the player with Mark this moment, Speed, Quality; the list is clipped at the player's bottom edge with no visible scroll affordance (`Player.tsx:757`). Related/Up next (`runB/scene_related.png`): compact rows, good; starts at y≈1489 of a 4249 px page. Tapping the picture starts playback and the chrome stays (`runB/scene_2795_tapped.png`). Landscape (`runE/scene_2775.png`, `runH/land_scene_scrolled.png`): true full-screen player with flix controls plus a "1×" speed chip and Theater; the hint pill still shows at 0:00. Theater toggle is not a visible button in portrait (tap returned 0×0); it lives in the settings menu.

**Performer 447 / 807** (`r1/performer_447.png`, `r1/performer_807.png`, `runC/performer_about.png`, `runC/performer_shelf_grid.png`, `runC/performer_shelf_grid_scrolled.png`). Big portrait, name, aka line (single-line clamp), facts line, Follow / stars / Add to filters / Block / About (About is 55×20 text). "Not in your library yet" shelf with an icon-only Row/Grid toggle (34×26; labels `hidden sm:inline`, `WantedRow.tsx:154`) and its hint "N on StashDB · Get fetches one scene" hidden on phones (`WantedRow.tsx:57`). The library's filter bar is at the very bottom of the first screen; the grid is a full screen down. About expands to a facts grid and 30+ external hostnames with duplicates (dbnaked, iafd, instagram twice). Grid view works and infinite-loads; its 2-column cards truncate studio and performer lines.

**Studio 6** (`r1/studio_6.png`). Logo tile, the parent network as muted text (is it a link? no affordance), name, count, Follow / Add to filters / Block; shelf with a single card and a "Show more" chip; filter bar; grid.

**Tag 25** (`r1/tag_25.png`). "#" eyebrow, name, count, then Pin / Add to filters / Block, then the filter bar with another "Pin to home". Two different pins with the same icon 120 px apart (`Tag.tsx`, `SceneBrowser.tsx:244`).

**Directories** (`r1/performers.png`, `r1/studios.png`, `r1/tags.png`). Performers: search, Women/Men/Everyone segmented, sort chips that overflow sideways ("Ran…" cut), 2-column portraits with 30×30 heart buttons. Studios: Networks/Grid/Table segmented + Following; networks grouped with "All of X" tiles. Categories: "Popular" chip sits right of the search field while "A–Z" wraps to its own line; pinned tiles with 28×28 pin buttons.

**Playlists / Playlist** (`r1/playlists.png`, `runG/playlist_page.png`). List: name field + Create, one Favorites card (7). Page: hero, "7 videos · 3:40:44", Play all / Station / Shuffle, numbered rows with 32×32 up/down/remove and titles truncated to ~10 characters because the thumbnail is 288 px wide. First load showed a bare spinner for >3 s (`runC/playlist_page.png`).

**Continue / History / Stats** (`r1/continue.png`, `r1/history.png`, `r1/stats.png`). A secondary tab strip "Continue watching · History · Stats" under the header: clear. Continue reuses the full filter bar (Pin to home, Station, Select) above resumable cards. History: dated groups, 32×32 "×" remove with no undo. Stats: four tiles, a bar chart, top performers: readable.

**Stations list** (`r1/stations.png`, `runG/stations_cards_scrolled.png`). Explanatory paragraph + "New station"; cards with Resume strip, pencil/trash 31×31, "Shuffle" and "Unwatched" chips that are launch variants but look like toggles; Quick start tiles. Not entered.

**Search** (`runC/search_open.png`, `runC/search_results.png`, `runC/search_nomatch.png`). Header icon toggles a full-width field with autofocus; results dropdown with query row, performer, studio, scenes: good. No-match shows only the "Search “zzqqxx” / All videos" row, which leads to the empty Browse. Clear "×" is 16×16.

**Settings** (`r1/settings.png`, `runC/settings_full.png`, code `Settings.tsx`). Order: Clean up card, Blocklist (with search), Not interested (when any), Performer preferences, Featured dials, Playback, Panic key, Private session, Cache, Keyboard, Diagnostics, Sign out. Copy is plain and honest. Keyboard and Panic key sections are keyboard-only features shown on a device without one.

**Duplicates / Cleanup** (`r1/duplicates.png`, `r1/cleanup.png`). Both explain themselves in one sentence; Duplicates marks Keep vs Delete with a sticky action bar; Cleanup's list chips wrap to two rows, then the filter bar adds three more rows, so the first card starts at ~820 px.

**Mini-player** (`runD/3-tap_Home_tab.png`). Docked above the tab bar: 128×72 picture, two-line title, time, Expand, Pause, Stop. All three restore paths pass. It covers the next row heading, acceptable.

## 3. Findings ranked by user impact

1. **Landscape header pushes Settings off-screen.** Evidence: `runE/home.png`, `runE/browse.png`; measured Settings 951–987 in a 932 viewport; `Layout.tsx:84` (`overflow-x-clip`), `:94` (`md:flex` nav), `:116` (`sm:block` search). Why: in landscape the phone hits the desktop breakpoint and nothing collapses; the gear and half the Private toggle are unreachable. Change: raise the desktop nav to `lg:` and keep the phone header (search icon, no inline nav) through `md`, or hide the inline SearchBox below `lg`. Effort S. Confidence high.

2. **"Pin to home" popover hidden behind the first card.** Evidence: `runA/browse_pin_popover.png`; `SceneBrowser.tsx:252`. Why: the user taps Pin, sees a half-hidden box and a caret, cannot read or edit the title. Change: portal the form to `body` as a bottom sheet on `(pointer: coarse)`, as CardMenu does (`CardMenu.tsx:76-85`). Effort S. Confidence high.

3. **Filter bar costs three rows on every list; library grid buried on entity pages.** Evidence: `r1/browse.png` (first card at y≈465), `r1/performer_447.png`, `r1/studio_6.png`, `r1/cleanup.png`; `SceneBrowser.tsx:161-215`, `Performer.tsx:84-85` (shelf before browser). Why: the job on a performer page is "find a scene"; the user scrolls past a shelf of things they do not own, then three rows of controls. Change: on phones, one horizontally scrolling chip row (Filters · sort · ⋯) with Select/Pin/Station in a "⋯" sheet; count inline with the sort; render the shelf collapsed to its heading + count with the grid first, or place the shelf after the library's first page. Effort M. Confidence high.

4. **Long-press sheet is undiscoverable, misses Save, exposes Delete.** Evidence: `runA/browse_longpress_sheet.png`; `SceneCard.tsx:136-146`, `CardMenu.tsx:97-110`. Why: a first-time user never finds the sheet; one who does cannot save to a playlist from it, but can reach Delete after an accidental 500 ms hold. Change: add "Save to playlist…" to the sheet (opens PlaylistMenu); move Delete behind the scene page; on touch, replace the two 30 px card icons with one 44 px "⋯" that opens the same sheet. Effort S–M. Confidence high.

5. **Delete in the scene's main action row beside Save.** Evidence: `r1/scene_2775.png`; `Scene.tsx:171-179`. Why: red destructive control at equal weight next to a frequent one, 16 px apart. Change: move it into the details card next to Identify (`Scene.tsx:255`) or into the "⋯" sheet. Effort S. Confidence high.

6. **Tap targets under 44 px everywhere.** Evidence: `phone-flow.mjs` `targets` output per page (header 36×36; card heart/save 30×30 `SceneCard.tsx:276-279`; stars 22×22 `ui.tsx:52`; "+" 24×24 `AddFilter.tsx`; title pencil 16×16; search Clear 16×16 `SearchBox.tsx:118`; chips 28 tall `ui.tsx:135`; sort select 24 tall `SceneBrowser.tsx:181`; history × 32×32; directory hearts 30×30; tag pins 28×28; station pencil/trash 31×31; row/grid 34×26). Why: mis-taps on a dense meta line (heart vs save), hard star rating. Change: `touch:` variants: `touch:p-2.5` on icon buttons, `touch:min-h-11` on Chip and the sort label, `touch:size-7` on stars, 44 px hit area around the pencil and Clear. Effort M. Confidence high.

7. **Icon-only and unexplained controls on touch.** Evidence: `r1/home.png` header; `r1/scene_2775.png` "+" and droplet; `r1/performer_447.png` row/grid; `runA/home_after_stacked.png` badge; code `Layout.tsx:106-139` (aria only), `WantedRow.tsx:57,154` (`hidden sm:inline`), `Scene.tsx:160` (`title=` only). Why: `title` never shows on iOS; "ghost" and "eye" look alike; "+" reads as "follow/add" not "add to Browse filters"; the Browse badge "2" has no meaning until tapped. Change: show the shelf hint and toggle labels on phones; a one-time first-use toast for Discreet/Private; label "+" as "Filter" text chips on the scene page; badge tooltip → chip text "2 filters" on Browse itself. Effort S. Confidence medium-high.

8. **Double "hold to mark" hint, and it covers the controls.** Evidence: `r1/scene_2775.png`, `runE/scene_2775.png`; `Player.tsx:632-635`, `Moments.tsx:23-27`. Why: shown while paused at 0:00, before the user has any reason to mark; the pill overlaps the rounds. Change: show the pill only after playback has run a few seconds, once per video, and drop the body copy when the player hint is eligible. Effort S. Confidence high.

9. **Player settings menu clipped inside the player.** Evidence: `runB/scene_player_settings.png`; `Player.tsx:757` (`absolute bottom-11 w-60 overflow-y-auto`). Why: the Quality list, "Skip to here" and Theater are below the player's bottom edge with no scrollbar on iOS; the user does not know to scroll a 240 px box. Change: on `(pointer: coarse)` render as a bottom sheet portalled to body. Effort S–M. Confidence high.

10. **One-column Browse is low density.** Evidence: `r1/browse.png` (1.5 cards per screen), compare `r1/performers.png` (2 columns). `SceneBrowser.tsx:131` (`grid-cols-1`). Why: scanning 2,584 videos one at a time; the directories already prove 2 columns read fine. Change: a density toggle (1/2 columns) remembered in storage, default 2 with compact meta. Effort M. Confidence medium (taste).

11. **Spinners where a skeleton or cached card fits.** Evidence: `runC/playlist_page.png` (spinner >3 s), `Performer.tsx:26` (`Spinner mt-32`), `Scene.tsx:333` (spinner when no cached card). Why: Home and Browse use skeletons so the contrast is felt. Change: EntityHeader skeleton for performer/studio/playlist; keep the cached-card placeholder. Effort S. Confidence high.

12. **Empty states have no next action.** Evidence: `runA/browse_empty.png`, `runC/search_nomatch.png`; `SceneBrowser.tsx:91`, `SearchBox.tsx:48-54`. Change: Empty with a "Clear filters" button when filters are set; search dropdown adds "No performers, studios or tags match" under the query row. Effort S. Confidence high.

13. **Two "Pin" controls on tag pages.** Evidence: `r1/tag_25.png`; `Tag.tsx`, `SceneBrowser.tsx:244`. Change: label the tile pin "Pin in Categories" or use a star icon. Effort S. Confidence medium.

14. **Desktop-only copy on the phone.** Evidence: `runC/settings_full.png`; `Settings.tsx:95-101` (Keyboard), `:268-275` (Panic key: Esc twice), Scene details code `Scene.tsx:236`, player tooltips with key hints `(k)`, `(m)`. Change: hide Keyboard and Panic sections under `touch:hidden` or add "On a keyboard:" lead-in; label the studio code. Effort S. Confidence high.

15. **Categories control wraps awkwardly; Performers sort chips clip.** Evidence: `r1/tags.png` (Popular right of the field, A–Z alone below), `r1/performers.png` ("Ran…" cut). `Directories.tsx:413-418, 51-56`. Change: a dedicated chip row under the field; horizontal scroll with end fade. Effort S. Confidence high.

16. **Playlist rows truncate titles to a few words.** Evidence: `runG/playlist_page.png`; `Playlists.tsx:160-195` (thumbnail width + three 32 px buttons). Change: on phones drop Move up/down for drag or a "⋯", shrink the thumbnail to 96 px. Effort S. Confidence high.

17. **History remove has no undo.** Evidence: `r1/history.png`; `History.tsx:48` `useRemoveFromHistory`. Change: toast with Undo like "Not interested" (`CardMenu.tsx:103`). Effort S. Confidence medium.

## 4. Taps-to-goal

| Job | Taps today | Path today | Taps proposed | How |
|---|---|---|---|---|
| Play a scene from the home feed | 1 (hero Play) / 1–2 (card, then Play unless "play on open") | Home → card → scene | 1 | Card tap plays when "Start playing when I open" is on (already); make the setting's effect visible in the sheet ("Play") |
| Resume the last watched scene | 2–3 | Continue tab → first card → (Play) | 1 | A "Continue watching" row first on Home, or hero "Resume" pinned to the last watched scene |
| Find a performer's newest scene | 3 + a screen of scrolling | Performers → performer → scroll past shelf and filter bar → card | 3, no scroll | Library grid before/collapsed shelf, one-row filter bar |
| Add a scene to a playlist (count only) | 2 | card save icon (30 px) → playlist row | 2 | Same, but from a 44 px "⋯" and from the long-press sheet |
| Block a tag (count only) | 3 | Categories → tag → Block | 3 | Unchanged |
| Switch the shelf to grid | 1 | icon-only toggle 34×26 | 1 | Labelled 44 px toggle |
| Get back from the mini-player | 1 | picture / title / Expand | 1 | Unchanged (verified) |
| Change sort | 2 | sort select → option | 2 | 44 px tall control |
| Apply one filter | 3 | Filters → chip → Show | 3 | Unchanged; move Watched/Rating above the tag cloud so the chip is on screen |

## 5. Quick wins (each ≤ half a day)

- Collapse the desktop nav below `lg` so the landscape phone keeps the phone header (`Layout.tsx:94,116`).
- Portal the Pin popover to body as a sheet on touch (`SceneBrowser.tsx:252`).
- Add "Save to playlist…" to CardMenu; drop "Delete…" from the card sheet on phones.
- Move the scene page's Delete into the details card.
- `touch:` padding on icon buttons, chips, stars and the sort label; 44 px hit areas for the title pencil and search Clear.
- Show the shelf hint and Row/Grid labels on phones (remove `hidden sm:inline` in `WantedRow.tsx:57,154`).
- Gate the hold hint on playback having started; remove the duplicate Moments sentence.
- "Clear filters" button inside the Browse empty state; "no match" line in the search dropdown.
- Skeleton for performer/studio/playlist headers.
- Hide Keyboard and Panic key sections under `touch:hidden`.
- Dedupe performer URLs by hostname.
- Undo toast for History remove.

## 6. Open questions

- **Standalone Back button**: could not be verified headless. `Emulation.setEmulatedMedia` with `display-mode: standalone` did not change `matchMedia` in headless Chrome (`runF`: `std:false`, `back:false` even at history index 2), so `Layout.tsx:46` is untested here. Worth a real-device check, and the `!atStart` rule means a scene opened as the app's first page gets no Back and no highlighted tab.
- **Sort control**: a native `<select>` is right on iOS (wheel picker), but at 24 px tall and with no visible chevron it does not read as a control. Keep native and restyle, or move into the Filters sheet?
- **Shelf placement** on Performer/Studio: should "Not in your library yet" lead at all on a phone, or sit behind a header toggle? Depends on how often the user fetches from the phone.
- **Stations card chips** ("Shuffle", "Unwatched") read as toggles; are they alternate starts? Not entered, so unverified.
- **Browse density**: 1 vs 2 columns is a preference; worth a quick A/B by the user before building the toggle.
- **Studio parent name** (the parent network on `r1/studio_6.png`) looks like plain text; is it a link?

## Script worth keeping

`(scratch)/audit/phone/phone-flow.mjs`
— step-driven headless Chrome at phone size, same `Network.setBlockedURLs` block as `mobile-check.mjs`. Steps as
JSON in `STEPS`: `goto`, `tap` (css), `tapText` (button/link text), `longpress`, `type`, `key`, `scroll`,
`scrollTo`, `back`, `eval`, `shot`, `full` (whole-page capture), `targets` (lists every visible control under 44 px
with its size). Usage:

```sh
STEPS='[{"goto":"/browse","targets":true},{"tapText":"Filters","shot":"sheet"}]' node phone-flow.mjs <outdir> http://localhost:5174
```

Candidate for `scripts/` as `scripts/phone-flow.mjs` with a manifest entry and a line in
`wiki/runbooks/mobile-checks.md`; the `targets` probe alone would make a useful regression check.
