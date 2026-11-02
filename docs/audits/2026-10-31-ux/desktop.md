# flix desktop UX audit (1440×900 and 1920×1080, mouse + keyboard)

Date: 2026-10-31. Driven against the running Vite dev server (http://localhost:5174) with headless Chrome over CDP only. Every run kept the Stash-write block list verbatim; no app-database writes were triggered (no playlist, block, favourite, rating, pin, station or settings action was clicked). Screenshots live under `(scratch)/audit/desktop/` (abbreviated below as `…/desktop/`). Run folders: `r1/` (static 1440 pages via `scripts/mobile-check.mjs` with `DESKTOP=1`), `rA/` `rC/` `rD/` `rE/` (1440 interactions), `rB/` (1920 pages).

Script worth keeping: `…/desktop/desktop-cdp.mjs` (scenario JSON → real CDP mouse moves, clicks, right-clicks, key presses, Tab, typing, scroll, eval, screenshots; same blocked-URL list as `mobile-check.mjs`). It would fit `scripts/` as `desktop-check.mjs` with the scenario files `scenA.json`…`scenE.json` as examples.

## 1. Executive summary

1. The desktop app is in good shape: dense grids, a clean scene page, a working `?` overlay, hover preview + sprite scrub on cards, right-click menus, a typeahead with arrow keys, and focus rings that are visible out of the box.
2. The biggest hierarchy problem is on performer and studio pages: the StashDB "Not in your library yet" shelf sits above the user's own videos, which fall below the fold at both 1440×900 and 1920×1080.
3. Every horizontal row (Home, shelves, Featured preview) loses its 24 px left gutter: `snap-start` snaps the first card to the scrollport edge, so cards sit flush at x=0 while headings sit at x=24.
4. Copy is split between two dialects and two vocabularies: "Favourite" vs "Favorite", "tags" vs "Categories", "scenes" vs "videos", "tap" on a mouse screen, "1790 videos" vs "1,790 videos" on the same page.
5. Accessibility gaps are small and cheap: 40 unnamed links per Browse page (thumbnail and studio avatar links), hover-only card buttons that take keyboard focus while invisible, an unlabeled big play button, no reduced-motion handling outside Stations.

## 2. Screen-by-screen notes

### Home (/) — `r1/home.png`, `rB/home_top.png`, `rA/home_s850.png`, `rA/home_rowhover.png`, `rA/home_s1700.png`, `rA/home_s3600.png`, `rD/homehero_herohover.png`
- Eye lands on the hero picture, then "TONIGHT'S PICK" and the title; Play is clear. Hero arrows appear only on hover (fine on desktop).
- First row under the hero is "Pick up a station" with 2 tiles and ~75 % empty width at 1440; "Featured" (the row the hero is built from) starts at y≈960, below the fold at 900 px.
- Rows: first card flush at x=0 while the heading is at x=24 (`rA/home_s850.png`, `rB/home_s1000.png`). Measured in `rE/`: each `Row` scroller has `scrollLeft: 24`, `scroll-padding-left: auto`, first child `scroll-snap-align: start`, first card x=0; the station strip (no `snap-start` children) has x=24.
- "See all" and "Station" row links are `opacity-0` until the row is hovered (`Row.tsx:19,24`); the Featured Shuffle icon is a 15 px icon at 60 % opacity in the far right (`rA/home_s850.png` top right).
- Featured "why" line is 11 px accent red ("A performer you watch · never watched"): reads like a warning, and it is the only red text on the page.
- Nothing in the nav is highlighted on Home (the logo is the only Home link; `Layout.tsx:84` renders `nav.slice(1)`).

### Browse (/browse) — `r1/browse.png`, `rB/browse_top.png`, `rA/browse_filters.png`, `rA/browse_select.png`, `rA/browse_hover300.png`, `rA/browse_hover1800.png`, `rA/browse_scrub.png`, `rA/browse_rclick.png`, `r1/browse_q_zzzzqqqxx.png`
- 4 columns at 1440, 5 at 1920 (`SceneBrowser.tsx:124`); sticky filter bar; "2,584 videos" count. Good density.
- Hover: at 300 ms the "NEW" badge and heart/save icons appear; by ~1.8 s the preview clip is playing (`hover1800` shows a different frame). Moving the mouse scrubs sprites with a timestamp and progress bar (`browse_scrub.png`, "21:27"). Nothing tells a new user that hovering previews or that moving scrubs.
- Right-click opens flix's menu (Play, Station from here, Add to Favorites, Mark as watched, Not interested, Delete…). The native menu is suppressed (`SceneCard.tsx:151`), so "Open link in new tab" and "Copy link" are gone; middle-click still works because the card is a real link.
- Filters dialog: well structured, live counts, "Show 2,585 videos" CTA, Esc closes. Helper text says "Tap to require one" (`Filters.tsx:318`).
- Select mode: checkboxes on every card, "Done", "Select all loaded"; no Shift+click range selection.
- Studio avatar discs: white logos on a white disc vanish (`r1/browse.png` cards 3, 6, 7 show plain white circles; the same studio has a white-on-dark logo in `rD/studios_grid.png`). `SceneCard.tsx:230` uses `bg-white`.
- Empty result: "Nothing matches these filters." with no action except the chip's ×; no "Clear filters" button (`SceneBrowser.tsx:91`).

### Scene (/scene/2775, /scene/2795) — `r1/scene_2775.png`, `rB/scene_top.png`, `rA/scene_hover.png`, `rA/scene_seekhover.png`, `rA/scene_gear.png`, `rA/scene_theater.png`, `rB/scene_theater.png`, `rA/scene_theater_s800.png`, `rA/scene_s700.png`, `rA/scene_s1400.png`, `rC/scene2795_top.png`, `rC/scene2795_s600.png`
- Layout: player + 400 px Related sidebar; at 1920 the player is 1368 px wide. Title, studio, stars, O, Favorite, Not interested, Delete, Save, performer strip, then description, tags, "File and links", "Identify on StashDB".
- `t` toggles theater (full-width video, info + sidebar below in a 1700 px grid): works, persists, header stays. `?` opens the overlay. Seek-bar hover shows a sprite thumbnail with time. Gear menu: Mark this moment, Quality, studio intro skip.
- Related sidebar runs ~20 items; past the info block the left column is empty for two screens (`rA/scene_s1400.png`).
- Every tag chip carries its own "+" (30 of them on 2775, `rA/scene_s700.png`): visually noisy.
- Performer names under avatars wrap to two lines ("Addison / Vodka", `rC/scene2795_top.png`).
- Icon buttons in the player have `title` + `aria-label` with the key in brackets ("Play (k)", `Player.tsx:890`); the big centre play button has neither (`Player.tsx:627`, confirmed by the `rD` probe: "BUTTON.absolute.inset-0.m-auto @457,314").
- The O action is described two ways: "O counter (also marks this moment)" on the page (`Scene.tsx:145`) and "Count an O at this moment" in the player (`Player.tsx:648`).

### Performer (/performer/447, /performer/807) — `r1/performer_447.png`, `rB/performer_top.png`, `r1/performer_807.png`, `rA/performer_about.png`, `rD/performer_grid.png`, `rD/performer_grid_s900.png`, `rC/performer807_s700.png`
- Header: portrait, name, aka, "57 videos · 45 years old · US · 2009–now", Follow / stars / Add to filters / Block / About. ~300 px of empty black to the right of the name block at 1440.
- "About" is muted text next to pill buttons; it reads as a label, not a control (`Performer.tsx:53`). Expanded, it shows a facts grid plus 27 external links in a flat wrap with duplicates (two instagram, two iafd).
- "Not in your library yet" (24 StashDB scenes, Row/Grid toggle) comes before the library. The user's own 57 videos start at y≈810 at 1440×900 (`r1/performer_447.png`) and at y≈810 at 1920×1080 (`rB/performer_top.png`). In Grid view the library is pushed further (`rD/performer_grid_s900.png` is still StashDB).
- On 807's page each card's performer line repeats the performer's own name (`rC/performer807_s700.png`); the "age 41" meta is a nice desktop detail.
- Header count "57 videos" and filter-bar count "57 videos" appear twice within 400 px.

### Studio (/studio/6, /studio/17) — `r1/studio_6.png`, `rC/studio17_top.png`
- Same pattern: shelf first. On /studio/6 the shelf has one item plus a "Show more" slot ("1+ on StashDB"), taking a full row for one card.
- Parent studio as an eyebrow link (the network name) is good.

### Tag (/tag/25, /tag/27) — `r1/tag_25.png`, `rC/tag_top.png`
- "#" accent eyebrow, "Blowjob", "1790 videos" (unformatted, `Tag.tsx:29`) directly above the filter bar's "1,790 videos" (`SceneBrowser.tsx` via `toLocaleString`). Pin / Add to filters / Block.
- The nav calls this area "Categories"; the page, Settings, Filters and search say "tag".

### Directories (/performers, /studios, /tags) — `r1/performers.png`, `rB/performers_top.png`, `r1/studios.png`, `rD/studios_grid.png`, `rD/studios_table.png`, `r1/tags.png`
- Performers: 6 columns at 1440, 8 at 1920; sort chips "Name · Most scenes · Rating · Recently added · Random" + Following; gender segmented control. "Most scenes" is the only place "scenes" is used (`packages/shared` `performerSorts`).
- Studios: Networks / Grid / Table views; sort "Most videos · Name". Table header mixes "Studio", "NETWORK", "Videos" cases (`rD/studios_table.png`).
- Categories: Pinned section first, then Popular/A–Z. Good.

### Playlists (/playlists, Favorites) — `r1/playlists.png`, `rD/playlist_favorites.png`
- One playlist; page is mostly empty but fine. Playlist page: numbered rows with drag handles (a real desktop affordance), Play all / Station / Shuffle.

### Continue / History / Stats — `r1/continue.png`, `rD/continue_hover.png`, `r1/history.png`, `r1/stats.png`
- Three sibling tabs, three widths: Continue is full width (tab bar at x=24), History is `max-w-4xl` (tab bar at x=265, `History.tsx:55`), Stats is `max-w-5xl` (x=200, `History.tsx:110`). The tab bar jumps sideways when switching.
- Continue cards show a progress bar but not time left; hover previews work.
- Stats: tiles, a 30-day bar chart, three top-10 lists. Clean.

### Stations list (/stations) — `r1/stations.png`, `rB/stations_top.png`, `rD/stationsnav_hover.png`
- At 1440 the first paint had blank covers for "Wife Pie" and "Everything" (`r1/stations.png`), loaded in later runs: no placeholder colour while the cover loads.
- Copy is good ("Endless play. Make one here, or start one from any list's Station button…").

### Search — `rA/search_cory.png`, `rA/search_arrow.png`
- `/` focuses the box, the kbd hint is visible, results group as query → performers → studios → tags → scenes without group headers; arrow keys move the highlight; Esc closes. Studio rows without a logo show an empty white disc.

### Settings — `r1/settings.png`, `rB/settings_top.png`, `rC/settings_s850.png`, `rC/settings_s1700.png`, `rC/settings_s2550.png`, `rC/settings_s3400.png`
- 3,663 px tall, one 768 px column, no page title, no section index. Order: Clean up card, Blocklist, (Not interested), Performer preferences, Featured, Playback, Panic key, Privacy, Cache, Keyboard, Diagnostics.
- The first thing on the page is a destructive tool ("Clean up the library") in a red-icon card; the settings people touch daily (Playback, Privacy) are two screens down.
- Copy read critically, see section 4. The Performer preferences paragraph refers to "your performer gender" but the gender switch lives on the Performers page, not here.
- Featured: "Saved" is a pink disabled button next to "Reset to defaults"; the preview row's cards start 24 px left of the column (`rC/settings_s1700.png`, same snap bug).
- PIN fields: "New PIN", "Again", "Set PIN". Panic URL input has no visible label (the paragraph above is the only cue).

### Duplicates and Cleanup — `r1/duplicates.png`, `rC/duplicates_close.png`, `r1/cleanup.png`
- Duplicates: Keep/Delete per copy, a floating "1 video · frees 785 MB · Reset · Delete…" bar: clear and safe-looking. "Other clean-up lists" link.
- Cleanup: "Pick a list or filter, tap videos to select them, then Delete." (`Cleanup.tsx:35`) on a mouse screen.

### 404 — `r1/nope_404.png`
- Bare "Not found" in muted text, no link home, no search (`routes/__root.tsx:6`).

### Keyboard help (`?`) — `rA/scene_help.png`
- Three columns; the `kbd` boxes for "L", "i", "b", "[ ]" stretch to two lines tall because the grid row wraps and the kbd has `justify-self-start` but no `self-start` (`Shortcuts.tsx:88`). "Jump to %" and "The station list" are terse.

### Focus and tab order (Browse) — `rA/tabs_tab13.png`, `rD/a11ybrowse_tab18.png`, `rD/a11ybrowse_tab21.png`, `rA/tabs_tab21.png`
- Order: logo → 7 nav links → search → eye → ghost → settings → Filters → sort → Select → Pin to home → Station → card 1 thumbnail → studio avatar → title → performers → (invisible) heart/save → card 2 … Sensible.
- Default `focus-visible` rings are visible on dark (`rA/tabs_tab13.png` gear, `rD/a11ybrowse_tab21.png` title). The sort `<select>` has `outline-none` and no focus style (`SceneBrowser.tsx:183`).
- Thumbnail link's accessible name is its badges ("4K27:50New"); the studio avatar link has none (probe: 40 unnamed `A.shrink-0` on /browse; `SceneCard.tsx:172` `alt=""`, `:232` `alt=""`).

## 3. Findings ranked by user impact

| # | Title | Evidence | Why the user feels it | Proposed change | Effort | Conf. |
|---|---|---|---|---|---|---|
| 1 | Performer/studio pages put StashDB's shelf above the user's own videos | `r1/performer_447.png`, `rB/performer_top.png`, `r1/studio_6.png`; `Performer.tsx` renders `WantedShelf` before `SceneBrowser` | Opening a performer you follow shows 24 videos you don't have; your 57 start below the fold at both sizes. Grid view makes it worse. | Render the library first and the shelf after it, or collapse the shelf to a heading "Not in your library yet · 24 on StashDB [Show]" that remembers its state per browser (like the Row/Grid toggle). | S | High |
| 2 | Every scroll row loses its left gutter (cards flush at x=0) | `rA/home_s850.png`, `rB/home_s1000.png`, `rC/settings_s1700.png`; `rE` measurement: `scrollLeft 24`, `scroll-padding-left auto`; `Row.tsx:32`, `WantedRow.tsx:25`, `FeaturedDials.tsx:79` | Headings and cards misalign on every Home row; the first card is cut by the viewport edge. | Add `scroll-pl-4 sm:scroll-pl-6` to the three scrollers (scroll-padding matches the padding so `snap-start` lands at 24 px). | S | High |
| 3 | Unnamed links and unlabeled play button | `rD.log` probe: 40 unnamed links on /browse, thumbnail name "4K27:50New"; `SceneCard.tsx:113-172, 229-232`; `Player.tsx:627` | Screen readers and voice control hear "link, link, link"; the big play button is "button". | `aria-label={scene.title}` on the thumbnail link, `alt={scene.studio.name}` (or `aria-label`) on the studio link, `aria-label="Play"` on the overlay button. | S | High |
| 4 | Hover-only card buttons take keyboard focus while invisible | `SceneCard.tsx:270` (`opacity-0` until `group-hover`, no focus variant); tab order in `rD.log` reaches them after the performer links | Tabbing through Browse hits two invisible stops per card; Enter toggles a favourite you cannot see. | Add `[@media(hover:hover)]:group-focus-within:opacity-100` (or `focus-visible:opacity-100` on each button). | S | High |
| 5 | Continue / History / Stats tabs jump sideways | `r1/continue.png` (tab bar x=24), `r1/history.png` (x=265), `r1/stats.png` (x=200); `History.tsx:55,110`, `Continue.tsx` | The same tab strip moves 240 px between clicks; it feels like three unrelated pages. | One wrapper width for the three (full width like Continue, with History's list capped at `max-w-4xl` inside it). | S | High |
| 6 | White studio logos vanish on the white avatar disc | `r1/browse.png` cards 3, 6, 7 (blank white circles) vs `rD/studios_grid.png` (same logos readable on dark); `SceneCard.tsx:230` `bg-white`; also `SearchBox.tsx:122`, `Scene.tsx:124` | A row of empty white dots carries no information and looks broken. | Use `bg-surface` (or a neutral mid grey) behind logos, or keep white but fall back to the initial when the image is mostly white; same disc in search and the scene header. | S | High |
| 7 | Phone wording on a desktop screen | `Filters.tsx:318` "Tap to require one", `Cleanup.tsx:35` "tap videos", `Settings.tsx:218` "tap it to go back" | Mouse users read "tap" and look for a touch target. | Use device-neutral verbs: "Pick one to require it", "select videos", "click or tap it". | S | High |
| 8 | Two dialects and three vocabularies | Favourite: `FeaturedDials.tsx:15-17`, `Stations.tsx:20`, `Home.tsx:81`, `describe.ts:45`, server `why` text; Favorite: `PlaylistMenu.tsx:130`, `Bulk.tsx:35`, `CardMenu` "Add to Favorites". "Most scenes" (`performerSorts`) vs "videos" everywhere. "Categories" (nav, `Layout.tsx:27`) vs "tag"/"Tags" (`Tag.tsx`, Settings, Filters, search). "centre" (`FeaturedDials.tsx:18,39`) | Same concept, different word, on the same screen (Home row "New from your favourites" above the "Favorites" playlist). | Pick US spelling (the playlist is literally named "Favorites" in the database): replace "Favourite(s)" and "centre"; rename `scenes_count` label to "Most videos"; pick "Categories" or "Tags" and use it in the page title, Settings Blocklist group, Filters hint and search subtitle. Table in section 4. | S | High |
| 9 | Counts formatted two ways on one page | `r1/tag_25.png` "1790 videos" + "1,790 videos"; `Tag.tsx:29`, `Studio.tsx:37`, `Performer.tsx:43` use raw numbers, `SceneBrowser.tsx:65/212` uses `toLocaleString` | Looks like two different numbers; the header count also duplicates the bar count 150 px lower. | `toLocaleString()` in the three headers, and drop the header count on list pages (the filter bar already states it) or drop it from the bar when a header has it. | S | High |
| 10 | Related sidebar leaves two empty screens | `rA/scene_s1400.png` | After the description the left 70 % of the page is black while 20 related items continue on the right. | Cap the sidebar at ~10 and show the rest as a "More like this" grid under the details at `lg`, or make the sidebar `sticky top-16` with its own scroll. | M | Medium |
| 11 | Settings has no map and starts with a destructive tool | `r1/settings.png`, `rC/settings_*.png`, `Settings.tsx:28-37`, scrollHeight 3,663 px | Finding "Keep playing while browsing" means scrolling past Blocklist, Performer preferences and eleven dials; the first card invites deleting. | Add an `h1` "Settings" and a sticky in-page section list (Playback, Privacy, Home feed, Blocklist, Performer preferences, Library tools, Cache, Keyboard, Diagnostics); move the Clean up card to a "Library tools" section near Cache. | M | High |
| 12 | Right-click hijacks the native menu | `rA/browse_rclick.png`; `SceneCard.tsx:151-156` `preventDefault()` | Desktop users lose "Open in new tab" and "Copy link" on cards. | Add "Open in new tab" (and "Copy link") to `CardMenu`, or skip `preventDefault` when Shift is held so the native menu is one modifier away. | S | High |
| 13 | Home's first row after the hero is a 2-tile station strip; Featured is below the fold at 900 px | `r1/home.png`, `rB/home_top.png` | At 1440×900 nothing to browse is visible without scrolling; the strip is 75 % empty. | Move "Pick up a station" below Featured (or to the right of the hero at `xl`), or shrink it to a one-line strip of resume pills. | S | Medium |
| 14 | "About" on performer pages looks like a label | `r1/performer_447.png`, `rA/performer_about.png`; `Performer.tsx:53` | Facts and links are hidden behind muted text nobody tries; meanwhile 300 px of header sits empty. | Style it as a ghost `Button` ("About · 7 facts · 27 links"), and at `lg` show Born/Height/Ethnicity inline in the header's empty area. Collapse the links into a "Links (27)" disclosure and dedupe hosts. | S | High |
| 15 | Performer's own name repeated on every card of her page | `rC/performer807_s700.png` | Every card's second line starts with the name you are already looking at; co-stars get truncated. | `SceneBrowser` already takes `cardMeta`; add `omitPerformer={p.id}` to `SceneCard` so the line shows the others. | S | High |
| 16 | Keyboard help: stretched key caps and terse labels | `rA/scene_help.png`; `Shortcuts.tsx:88` | "L", "i", "b", "[ ]" render as tall slabs; "Jump to %" is unclear. | `self-start` on the `kbd`; "0–9: Jump to 0–90 %", "q: Show the station list", "Esc Esc: Panic: leave flix for the page in Settings". | S | High |
| 17 | Hover preview and scrub are undiscoverable | `rA/browse_hover300.png` → `hover1800.png` (1.5 s before the clip), `rA/browse_scrub.png`; nothing on screen says so | A desktop user who clicks straight away never learns the preview or the scrub. | Show a one-time hint under the first grid ("Hover a video to preview it; move the mouse to scrub"), dismissable, stored like `flix.theater`; add "Preview on hover" to the `?` overlay's Anywhere group. | S | Medium |
| 18 | "NEW" badge only visible on hover | `SceneCard.tsx:217` (`opacity-0 group-hover:opacity-100`), `rA/browse_hover300.png` | The only "unwatched" signal is hidden until the mouse is on the card. | Show it always at 80 % opacity, or use a small accent dot in the corner; keep the full badge on hover. | S | Medium |
| 19 | No reduced-motion handling except Stations | `grep prefers-reduced-motion` → `Stations.tsx:98` only; hero auto-advances every 12 s (`Home.tsx`), card zoom (`SceneCard.tsx:179`), preview autoplay | Users with "Reduce motion" still get an auto-rotating hero and autoplaying clips. | `motion-reduce:transition-none` on the card image, skip hero auto-advance and hover preview when `prefers-reduced-motion`. | S | High |
| 20 | Sort `<select>` has no focus style | `SceneBrowser.tsx:183` `outline-none` with no `focus:` variant | Keyboard users lose their place at the sort control. | `focus-visible:ring-1 focus-visible:ring-accent` on the `label` wrapper via `focus-within`. | S | High |
| 21 | Card meta at 12 px is ~4:1 contrast | `rE` probe: `text-muted/80` = `#8b8b9c` at 80 % on `#0b0b0f`, 12 px (`SceneCard.tsx:262`) | Dates and view counts are faint on a bright monitor. | Drop the `/80`, or raise to 13 px. | S | Medium |
| 22 | 404 is a dead end | `r1/nope_404.png`, `routes/__root.tsx:6` | A mistyped or stale link shows two words and nothing to do. | "This page doesn't exist." + Home link + the search box; same `ErrorBox` styling. | S | High |
| 23 | Empty list has no way out | `r1/browse_q_zzzzqqqxx.png`, `SceneBrowser.tsx:91` | "Nothing matches these filters." with the fix hidden in a chip's ×. | Add a "Clear filters" button to the empty state (same handler as the dialog's "Clear all"). | S | High |
| 24 | Multi-select has no range select | `SceneBrowser.tsx:48-55`, `rA/browse_select.png` | Selecting 30 videos to delete is 30 clicks. | Shift+click selects the range from the last toggled card; `Ctrl/Cmd+A` while selecting = "Select all loaded". | M | Medium |
| 25 | Studio page shelf shows "Show more" beside one card | `r1/studio_6.png` ("1+ on StashDB") | A whole row for one item and a vague count. | Fetch the total with the first page and say "1 on StashDB"; hide "Show more" when the page is short. | S | Medium |
| 26 | Station covers paint blank | `r1/stations.png` vs `rB/stations_top.png` | Grey rectangles on first paint, then pictures. | Give the cover a `bg-surface` placeholder and `decoding="async"` as cards do. | S | Medium |
| 27 | Loading states differ per page | Skeleton grid in `SceneBrowser.tsx:85`; `Spinner mt-24` in `Directories.tsx`, `History.tsx` | Browse paints a skeleton, Performers a lone spinner. | A tile skeleton for the three directories and the History list. | S | Medium |

## 4. Copy and consistency table

| Where | Current | Proposed |
|---|---|---|
| Home row title (`Home.tsx:81`), Featured why text, `FeaturedDials.tsx:15-17`, `Stations.tsx:20`, `describe.ts:45`, Privacy copy (`Privacy.tsx:21`) | Favourite / favourites | Favorite / favorites (matches the "Favorites" playlist, "Add to Favorites", "Favorited") |
| `FeaturedDials.tsx:18,39` | "Left of centre", "ignore (centre)" | "Left of center", "ignore (center)" |
| Performers sort (`performerSorts`) | Most scenes | Most videos |
| Nav (`Layout.tsx:27`), `/tags` title | Categories | Keep "Categories" in nav and page, then say "category" in the Tag page eyebrow ("Category"), Settings Blocklist group ("Categories"), Filters hint and search subtitle; or rename nav to "Tags". One word everywhere. |
| Tag page eyebrow (`Tag.tsx`) | "#" | "Category" (or "Tag") |
| Tag/Studio/Performer headers | 1790 videos | 1,790 videos (`toLocaleString`) |
| Filters hint (`Filters.tsx:318`) | Tap to require one; search a tag to exclude it. | Pick one to require it; search a tag to exclude it. |
| Cleanup (`Cleanup.tsx:35`) | Pick a list or filter, tap videos to select them, then Delete. | Pick a list or filter, select videos, then Delete. |
| Settings Playback (`Settings.tsx:218`) | …docks it in a corner, still playing; tap it to go back. | …docks it in a corner, still playing; click it to go back. |
| Settings Performer preferences (`Settings.tsx:188`) | a video needs one performer (of your performer gender) who matches | a video needs one performer of the gender chosen on the Performers page (Women / Men / Everyone) who matches |
| Settings Featured (`FeaturedDials.tsx:40`) | The picks below follow as you drag; Save makes them the Home page's. | The picks below update as you drag; Save applies them to Home. |
| Settings Featured buttons | Saved (disabled) · Reset to defaults | Save (disabled when unchanged) · Reset to defaults; show "Saved" as a toast |
| Settings PIN placeholders (`Privacy.tsx`) | New PIN · Again · Set PIN | New PIN · Repeat PIN · Set PIN |
| Settings Panic key | (unlabeled URL field) | Label "Go to" above the field |
| Settings Clean up card subtitle | Low resolution, never watched, low rated, unmatched, duplicates: select and delete | Find low-resolution, never-watched, low-rated, unmatched or duplicate videos and delete them |
| Settings Cache | Clear everything (red text, ghost button) | Clear all caches… (confirm dialog; see open question) |
| Scene page O button (`Scene.tsx:145`) vs player (`Player.tsx:648`) | O counter (also marks this moment) / Count an O at this moment | Count an O here (adds a marker) — same text in both |
| Shortcuts (`Shortcuts.tsx`) | 0–9 Jump to % · q The station list · Esc Esc Panic: leave flix | 0–9 Jump to 0–90 % · q Show the station list · Esc Esc Panic: leave flix for the page in Settings |
| Studios table header (`rD/studios_table.png`) | Studio · NETWORK · Videos | Studio · Network · Videos |
| Scene page details toggle (`Scene.tsx:216`) | File and links / Hide file and links | Show file and links / Hide file and links |
| Studio shelf hint | 1+ on StashDB · Get fetches one scene | 1 on StashDB · Get downloads one scene |
| 404 (`__root.tsx:6`) | Not found | This page doesn't exist. Go to Home or search above. |
| Empty list (`SceneBrowser.tsx:91`) | Nothing matches these filters. | Nothing matches these filters. [Clear filters] |
| Card menu vs page (`CardMenu.tsx`, `Scene.tsx:170`) | Add to Favorites / Favorite | Keep both (verb on menu, state on page) but the same spelling |

## 5. Quick wins (each under an hour)

1. `scroll-pl-4 sm:scroll-pl-6` on the three snap scrollers (finding 2).
2. `aria-label={scene.title}` on the thumbnail link, `alt`/`aria-label` on the studio avatar link, `aria-label="Play"` on the big play button (3).
3. `group-focus-within:opacity-100` on the card's hover buttons; `focus-within` ring on the sort pill (4, 20).
4. `toLocaleString()` in the three entity headers (9).
5. `self-start` on the `kbd` in `Shortcuts.tsx` and the three label rewrites (16).
6. Replace "tap" in the three strings; US spelling pass on "Favourite" and "centre" (7, 8).
7. "Clear filters" in the empty state; a real 404 with a Home link (22, 23).
8. Swap the studio disc to `bg-surface` (6).
9. One wrapper width for Continue / History / Stats (5).
10. `omitPerformer` on performer pages (15).

## 6. Open questions

- Shelf placement (finding 1): the `shelf-grid-view` history page suggests the shelf was deliberately placed first. Is the shelf meant to be the primary content of a performer page for the user, or a secondary "want list"? The answer decides between moving it and collapsing it.
- Does "Clear everything" under Settings → Cache confirm before acting? Not tested (write action). If not, it should.
- Should Browse have a Home nav item at desktop so something in the nav is active on `/`, or is the logo-as-Home intentional?
- Should the custom card menu replace the native one at all on desktop, given middle-click works? A Shift bypass keeps both.
- The Featured "why" line: is accent red chosen so it stands out, or would a muted pill read better? It is the only red text on Home.
- Reduced motion: should the hero stop auto-advancing under `prefers-reduced-motion`, or just the card zoom and autoplaying previews?
