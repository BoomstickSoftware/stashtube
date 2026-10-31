# flix client-side performance audit (2026-10-31)

Measured against the running Vite dev server at http://localhost:5174 (proxying the production BFF) with headless Chrome over CDP, writes blocked. Phone = 440×956, DPR 2, touch, iPhone UA. Desktop = 1440×900, DPR 1. Bundle numbers come from a production build written to the scratch directory (nothing landed in the repo; `git status` clean).

## 1. Executive summary

1. The bundle is in good shape: 98 kB gzip main + 42 kB gzip shared chunk + 13 kB CSS, every page in its own small chunk, hls.js (177 kB gzip) only for transcodes, no duplicated libraries, icons tree-shaken, no web font download. Nothing to win here.
2. The resized-thumbnail work from the review round is working: cards pick the right `?w=` variant on both viewports (phone 960 for 816 device px, desktop 640 for 332 px), every card image is `loading=lazy`, and a second load answers 95–100% of images from the HTTP cache.
3. The biggest user-felt cost is rendering, not bytes: Browse re-renders every loaded card on each page append (long tasks grow 58 → 190 ms from 80 to 760 cards on an M-series Mac, so ~3× that on a phone), Home renders ~260 cards and 456 `<img>` at once and re-renders them all every 12 s for the hero timer (a 65–70 ms long task while idle), and Tags renders all 1,106 tiles (11 k nodes, LCP 616 ms on the phone).
4. Layout shifts the user sees: Home's "Pick up a station" row is inserted between the hero and the rows ~300 ms after the feed paints (CLS 0.10 phone / 0.05 desktop), and the Whisparr shelf is inserted above the grid on studio/performer pages up to 0.9 s after they paint (CLS 0.13–0.17).
5. Images worth fixing: the video page's `<video poster>` loads the full-size screenshot (163 kB) instead of the 960 variant the placeholder already fetched; the Whisparr shelf loads 1920-px StashDB originals straight from stashdb.org (195–404 kB each, 1.4 MB of the performer page's 1.7 MB on desktop); row cards and tag tiles reuse the grid's `sizes` and over-fetch on the phone (960 where 640/320 would do).

## 2. Measurement tables

### 2.1 Production build (gzip), `vite build` to scratch

| Chunk | Raw | Gzip | Content |
|---|---|---|---|
| index (entry) | 306 kB | 98 kB | react-dom 207 kB raw (2/3 of it), app shell 61 kB, react-router runtime 9 kB, lucide 9 kB, scheduler, query-core glue |
| ui (shared) | 129 kB | 42 kB | @tanstack/router-core 51 kB, @tanstack/query-core 34 kB, react 8 kB, app ui 20 kB |
| index.css | 77 kB | 13 kB | Tailwind 4 output |
| hls | 574 kB | 177 kB | hls.js, dynamic `import()` only when the browser cannot play the HLS transcode itself |
| settings route | 24 kB | 7.6 kB | |
| SceneBrowser | 23 kB | 7.1 kB | shared by browse/performer/studio/tag/continue |
| scene route | 21 kB | 6.3 kB | |
| station route + lib | 23 kB | 8.3 kB | |
| Directories (performers/studios/tags) | 15 kB | 4.7 kB | |
| 40 other route/component chunks | 0.07–10 kB | ≤ 3.8 kB each | icons split per route |

First paint needs index + ui + css = **153 kB gzip** of JS/CSS. index.html modulepreloads ui and useMatch. lucide-react is imported by name in 36 files and tree-shakes to ~14 kB raw in total. `--font-sans` names "Inter" but no font is loaded, so the system font is used (no font request; harmless). Vite's chunk-size warning is only hls.js.

Dev-only note: in the dev server the unbundled `lucide-react.js` dep is 5.6 MB and `react-dom_client.js` 3.1 MB (11.9 MB of script on a cold dev load), which is why every cold dev route below shows ~80–90 script requests; production serves 3.

### 2.2 Cold load per route (fresh profile, no HTTP cache, no localStorage)

Script bytes omitted (dev server). `api` = BFF calls (count / gzip bytes). `img` = image requests / transfer bytes. LCP/CLS/long tasks from PerformanceObserver inside the page. Long = count (total ms).

Phone 440×956:

| Route | DCL | LCP | CLS | Long | api | img | first-screen imgs | 2nd load imgs cached | 2nd load api cached |
|---|---|---|---|---|---|---|---|---|---|
| / | 195 | 260 | **0.101** | 1 (127) | 9 / 33 kB | 17 / 413 kB | 6 | 15/16 | 0/4 |
| /browse | 59 | 168 | 0 | 0 | 3 / 18 kB | 16 / 251 kB | 5 | 56/57 | 0/3 |
| /scene/2775 | 39 | 224 | 0 | 0 | 5 / 7 kB | 12 / 223 kB (163 kB is the poster) | 3 | 12/13 | 0/4 |
| /performer/447 | 35 | 80 | 0 | 0 | 7 / 20 kB | 12 / 679 kB (568 kB from stashdb.org) | 4 | 46/47 | 0/8 |
| /performers | 40 | 104 | 0 | 0 | 2 / 3 kB | 15 / 473 kB | 6 | 14/15 | 0/2 |
| /studio/6 | 40 | 208 | **0.165** | 0 | 6 / 18 kB | 9 / 405 kB (197 kB stashdb) | 3 | 8/9 | 0/6 |
| /studios | 32 | 112 | 0 | 0 | 2 / 5 kB | 29 / 94 kB | 7 | 27/30 | 0/2 |
| /tags | 38 | **616** | 0 | 1 (121) | 2 / 22 kB | 55 / 698 kB | 12 | 54/55 | 0/2 |
| /tag/25 | 85 | 168 | 0 | 0 | 6 / 19 kB | 48 / 47 kB | 3 | 47/48 | 0/4 |
| /playlists | 34 | 72 | 0 | 0 | 1 / 1 kB | 2 / 59 kB | 1 | 1/2 | 0/1 |
| /continue | 33 | 124 | 0 | 0 | 3 / 18 kB | 28 / 160 kB | 5 | 27/28 | 0/3 |
| /history | 34 | 136 | 0 | 0 | 2 / 12 kB | 22 / 149 kB | 8 | 21/22 | 0/2 |
| /settings | 34 | 68 | 0 | 0 | 6 / 5 kB | 3 / 128 kB | 0 | 2/3 | 0/4 |
| /stats | 37 | 76 | 0 | 0 | 2 / 2 kB | 1 / 0 kB | 0 | 0/1 | 0/2 |
| /browse?q=a (search) | 35 | 148 | 0 | 0 | 3 / 16 kB | 14 / 174 kB | 5 | 13/14 | 0/3 |

Desktop 1440×900:

| Route | DCL | LCP | CLS | Long | api | img | first-screen imgs | 2nd load imgs cached |
|---|---|---|---|---|---|---|---|---|
| / | 85 | 136 | 0.068 (0.57 incl. the cold-browser spinner swap) | 1 (118) | 9 / 33 kB | 35 / 719 kB | 4 | 32/33 |
| /browse | 30 | 136 | 0 | 0 | 3 / 18 kB | 43 / 635 kB | 20 | 56/57 |
| /scene/2775 | 24 | 92 | 0.02 | 0 | 4 / 7 kB | 24 / 313 kB | 11 | 23/25 |
| /performer/447 | 25 | 116 | 0.098 | 0 | 8 / 21 kB | 34 / **1,668 kB** (1.4 MB stashdb.org) | 12 | 49/50 |
| /performers | 24 | 92 | 0 | 0 | 2 / 3 kB | 43 / 557 kB | 18 | 42/43 |
| /studio/6 | 38 | 460 | **0.126** | 0 | 6 / 18 kB | 31 / 761 kB | 10 | 30/31 |
| /studios | 30 | 92 | 0 | 0 | 2 / 5 kB | 38 / 121 kB | 12 | 37/38 |
| /tags | 31 | 312 | 0 | 1 (132) | 2 / 22 kB | 85 / 638 kB | 16 | 84/85 |
| /tag/25 | 32 | 128 | 0 | 0 | 6 / 19 kB | 49 / 47 kB | 16 | 48/49 |
| /continue | 33 | 156 | 0 | 0 | 3 / 18 kB | 43 / 183 kB | 20 | 42/43 |
| /history | 31 | 104 | 0.01 | 0 | 2 / 12 kB | 18 / 120 kB | 6 | 17/18 |
| /settings | 73 | 108 | 0 | 0 | 6 / 5 kB | 6 / 75 kB | 0 | 5/6 |
| /browse?q=a | 29 | 104 | 0 | 0 | 3 / 16 kB | 34 / 343 kB | 20 | 33/34 |

API responses are never served from the HTTP cache on a reload (0/N everywhere): `/api/*` carries gzip but no ETag or Cache-Control, so every reload re-downloads every list in full. Only the React Query persistence (session, home, settings, favourites, playlists, blocklist) covers the first paint.

### 2.3 DOM and CPU per route (phone, cold)

| Route | DOM nodes | `<img>` | script ms | task ms | notes |
|---|---|---|---|---|---|
| / | **7,481** | **456** | 199 | 320 | 13 rows, 10 of them with 24 cards; 1 long task 127 ms |
| /tags | **11,184** | **1,105** | 138 | 268 | 1,106 tiles rendered at once; LCP 616 ms; long task 121 ms |
| /browse | 1,417 | 80 | 45 | 76 | 40 cards |
| /performer/447 | 1,857 | 106 | 56 | 110 | |
| /studios | 1,247 | 146 | 34 | 63 | 200 studios in one page |
| /scene/2775 | 661 | 27 | 41 | 72 | |

### 2.4 API call sequence (start offset in ms from navigation, duration)

| Route | Sequence | Waterfall? |
|---|---|---|
| / (phone) | session, continue-count, settings @216 → home @231 (204 ms) → stations/resume, favorites, playlists @533 → features @551 → whisparr/new @655 | yes: resumes/favourites/playlists wait for the feed to render (they are hooks inside Row/PickUpStations); the station row then shifts the page |
| /browse | tags(1000) @73, scenes p1 @74, continue-count @74 | no |
| /scene/2775 | scene @40 (loader prefetch) → playlists, related, features @56 | small (16 ms); related waits for the page chunk |
| /performer/447 | performer @48 (6 ms) → blocklist, features, tags(1000), scenes @58 → whisparr @67 (487–911 ms) | **yes**: the grid's query waits for the performer record because the page returns a spinner until `p` arrives (`Performer.tsx:783`); same in `Studio.tsx:22` (22 ms record → scenes @79) and `Tag.tsx:21` |
| /settings | blocklist, hidden, featured/preview (POST), admin/cache @51 → playlists @93; admin/cache then polls every 5 s | fine |

### 2.5 Scrolling (infinite grid)

Next-page trigger: `Sentinel` with `rootMargin: '800px'` (`ui.tsx:29`), page size 40. Measured from a fetch hook inside the page (scroll position at the moment the page request left):

| Viewport | Page 2 requested at distance to bottom | Images per page | Bytes per page | Long task per append |
|---|---|---|---|---|
| Phone (page = 13.8 k px tall, 14 screens) | 660 px (0.7 screens) while flicking 765 px / 200 ms | 42 (40 cards + logos) | 1.3–1.4 MB (960 variants, ~31 kB each) | 55–84 ms (pages 2–7) |
| Desktop (page = 3.1 k px, 3.4 screens) | 215–750 px | 42–43 | 0.75–1.2 MB (640 variants, ~18 kB each) | 58 ms at page 2 → **190 ms at page 19** (760 cards), 3.6 s of script over 18 appends |

No blank-at-bottom sample was observed on the LAN (fetch 7–110 ms). The append cost grows linearly with cards loaded, which is the re-render of the whole grid (below).

### 2.6 Hover and drag previews (desktop /browse)

| Action | Requests | Bytes |
|---|---|---|
| Mouse rests on one card 3 s | VTT 6.4 kB + preview clip (640×360, 9 s, 956 kB, fully buffered: range 0–end) | ~0.96 MB |
| First mouse movement over the hovering card (scrub) | sprite sheet JPEG | **519 kB** |
| Mouse crosses 3 cards at 500 ms each | 3 VTTs + 3 clips (822, 966, 891 kB) | **2.6 MB** |

`HOVER_DELAY` is 350 ms (`SceneCard.tsx:16`), the VTT is fetched on pointer enter with no delay (`SceneCard.tsx:73`), and the clip is `preload="auto"` so the whole 0.8–1.0 MB clip is downloaded per hovered card. On a phone the same clip loads on a 10 px drag.

### 2.7 Image variant fit (true pixel width of the chosen source vs device pixels covered)

| Place | Rendered | Device px needed | Chosen variant | Fit |
|---|---|---|---|---|
| Grid card, phone | 408 css | 816 | 960 | right (1.18×) |
| Grid card, desktop | 332 css | 332 | 640 | 1.9× (ladder has no 480) |
| Home row card, phone (78vw) | 343 css | 686 | **960** (sizes says 100vw) | 1.4×, 640 would do |
| Tag tile, phone (2 columns) | 198 css | 396 | **960** (sizes = CARD_SIZES) | 2.4×, 640/320 would do |
| Tag tile, desktop small | 207 css | 207 | 640 | 3.1× |
| Studio logo in a card | 28×8 css | 56 | 320 (2–31 kB) | 5–11× |
| Performer avatar on the video page | 80 css | 160 | 320 | 2× |
| Whisparr shelf card (stashdb.org) | 290 css | 580 | original **1920 px**, 195–404 kB | 3.3× phone, 7.4× desktop |
| Hero, phone / desktop | 408 / 789 css | 816 / 789 | 960 | right |
| Video page poster | 408 / 789 css | 816 / 789 | **full original** 163 kB | the placeholder already fetched the 960 variant (~35 kB) |

Every card image has `loading="lazy"` and `decoding="async"`; row images off to the side are not fetched (456 `<img>` on Home, 17 fetched on the phone). Entity avatars and logos lack `decoding="async"` (harmless at their size).

## 3. Findings, ranked by user impact

### F1. Browse re-renders every loaded card on each page append (grows without bound)
Evidence: desktop long tasks per append 58 ms (80 cards) → 190 ms (760 cards), 3.6 s script for 18 appends; phone 55–84 ms per append by page 7 (M-series Mac; expect ~3× on an iPhone, so 150–250 ms freezes while flicking). `SceneBrowser.tsx:391` flattens `data.pages` into a new array every render; `SceneBrowser.tsx:440–447` passes a fresh `select` object/closure and `extra={cardMeta?.(s)}` per card; `SceneCard` is not memoized, and each card mounts `FavoriteSceneButton` and `PlaylistMenu` (hooks + listeners: 3.4 k → 9.6 k listeners by 280 cards).
Why the user feels it: a hitch at every page boundary while scrolling Browse/performer/tag grids, worse the further they scroll; the same on Continue.
Proposed change: wrap `SceneCard` in `React.memo`; make `toggle` stable (`useCallback`) and pass `selected` as a boolean prop rather than an object; `useMemo` the flattened `scenes`; have `FavoriteSceneButton` subscribe with a `select` on the favourites query so one favourite toggle does not re-render every card. For long sessions add `@tanstack/react-virtual` on the grid (rows of N cards) or `content-visibility: auto; contain-intrinsic-size` on each card wrapper, which keeps off-screen cards out of layout/paint at zero code cost. Effort: S (memo) / M (virtualization). Confidence: high (measured).

### F2. Home renders ~260 cards and re-renders them all every 12 s
Evidence: 13 rows (10 × 24 cards + hero + stations + wanted), 7,481 nodes, 456 `<img>`, 320 ms task time and a 127 ms long task on cold paint (phone). Idle for 13 s: +79 ms script and one 69 ms long task on the phone profile, +76 ms / 65 ms on desktop, from `setHeroId` in `Home.tsx:81–84` which re-renders `Home` and every `Row`/`SceneCard` (none memoized) each `HERO_EVERY` tick (`Home.tsx:131`).
Why the user feels it: a slow first paint of Home on the phone and a periodic stutter/battery cost while Home sits open (e.g. while a preview or the hero plays).
Proposed change: move the hero index state into `Hero` (or a `useReducer` scoped there) so the tick re-renders only the hero; `React.memo(Row)` and `React.memo(SceneCard)`; render rows lazily (`content-visibility: auto` on each `section` with `contain-intrinsic-size: auto 300px`, or mount rows below the fold on an IntersectionObserver). Optionally have the server send 12 cards per row and lazy-load the rest on "See all" (halves the 28 kB feed and the 456 images). Effort: S for the state move + memo, M for lazy rows. Confidence: high.

### F3. Tags page renders all 1,106 tiles with grid-sized images
Evidence: 11,184 nodes, 1,105 `<img>`, LCP 616 ms and a 121 ms long task on the phone, 53,661 px tall; tiles use `sizes={CARD_SIZES}` (`Directories.tsx:471`) so a 198-px tile asks for the 960 variant (2.4× the pixels; 55 images = 698 kB on the first screens, ~14 MB if scrolled to the end vs ~5 MB at the right size). `/api/tags/tiles` is 21 kB gzip.
Why the user feels it: Categories is the slowest page to appear on the phone and scrolls heavily.
Proposed change: a tile `sizes` of `(min-width:1536px) 12.5vw, (min-width:1024px) 16vw, (min-width:640px) 25vw, 50vw` (big tiles: 33vw/50vw); `content-visibility: auto` on tiles or render the "rest" grid in chunks of ~60 on a Sentinel; consider collapsing tags under a count threshold behind "Show all". Effort: S (sizes) / S–M (chunking). Confidence: high.

### F4. Layout shifts after first paint on Home and on studio/performer pages
Evidence: Home CLS 0.101 (phone) / 0.052 (desktop) from `section.group/row` at t≈518–605 ms: `PickUpStations` (`Home.tsx:137`) renders between the hero and the rows once `/api/stations/resume` (a separate query, fetched only after the feed renders, t=533) arrives. Studio 0.165/0.126, performer 0.098 (desktop): `WantedShelf` is rendered above `SceneBrowser` (`Performer.tsx:841`, `Studio.tsx`) and appears when `/api/whisparr/studio/6` answers after **911 ms** (phone run) / `/api/whisparr/performer/447` after 487 ms; plus the entity pages swap a centred spinner for the full page (`Performer.tsx:783`). On a cold browser the Layout's session spinner → app swap adds 0.5 (desktop), avoided on warm opens by the persisted session.
Why the user feels it: the row they were about to tap moves down under their finger ~0.3–0.9 s after the page looked ready.
Proposed change: include the station resumes in the home feed payload (or persist `station-resume` and give the section a reserved min-height when `resumes` is undefined); render the Whisparr shelf below the grid, or reserve its height (`min-h`) while `useWanted` is loading, and prefer the latter since Whisparr answers slowly; render the entity header skeleton instead of a spinner (see F6). Effort: S each. Confidence: high (shift sources captured).

### F5. Whisparr shelf images are 1920-px StashDB originals fetched from the internet
Evidence: `WantedRow.tsx:76` `<img src={w.image}>` where `image` is Whisparr's `remoteUrl` (`whisparr.ts:138`); on /performer/447 desktop the five largest responses are stashdb.org images of 195–404 kB (1.4 MB of the page's 1.7 MB), rendered at 260–290 css px; phone 2 × ~290 kB. They bypass the asset cache, the resize step and the LAN.
Why the user feels it: the performer page is by far the heaviest page (679 kB phone, 1.7 MB desktop) and the shelf pops in late; each visit re-downloads from the internet unless StashDB's CDN caches well; the browser also talks to a third party (no-referrer is set, but the request itself leaves the LAN).
Proposed change: route them through the proxy (`/media/wanted/<id>` → asset cache → `?w=320|640` WebP), which also hands them `loading=lazy`+`srcSet` like other cards. Effort: M. Confidence: high.

### F6. Entity pages wait for the record before fetching the grid (and show a spinner meanwhile)
Evidence: `Performer.tsx:783`, `Studio.tsx:22`, `Tag.tsx:21` return `<Spinner>` until the record loads, so `useScenes` starts only after it: performer @48→scenes @59, studio @53 (22 ms)→@79, tag @96→@106. Cheap on a warm BFF, but a cold `/api/studios/<id>` or a Stash scan ("database is locked", retried with backoff) stalls the whole page, not just the header.
Why the user feels it: a blank page with a spinner instead of the grid appearing while the header fills in; on cold data the delay doubles.
Proposed change: render the header as a skeleton with the `SceneBrowser` underneath from the first render (`base` only needs the id), or add a route `loader` that prefetches both `usePerformer` and the first scenes page with `prefetchInfiniteQuery` on intent, as `scene.$id.tsx` already does for scenes. Effort: S. Confidence: high.

### F7. The video page loads the full-size screenshot as the poster
Evidence: `Player.tsx:540` `poster={scene.screenshot}`; `/media/stash/scene/2775/screenshot` = 163 kB on both viewports, while `ScenePlaceholder` (`Scene.tsx:729`) already fetched the 960 variant (~35 kB) via srcset. 163 kB is the single largest response of the page.
Why the user feels it: on the phone the poster shows ~100 ms later than it could, and the extra bytes compete with the first media segments.
Proposed change: `poster={sized(scene.screenshot, 960)}` (desktop theater/4K could use the original). Effort: S. Confidence: high.

### F8. Hover previews start eagerly and are heavy
Evidence: 350 ms hover delay, VTT fetched on enter, clip fully buffered (`preload="auto"`, 0.8–1.0 MB each, 640×360 9 s), 519 kB sprite sheet on the first mouse move; a mouse crossing 3 cards at 500 ms each costs 2.6 MB. On the phone the clip starts on a 10 px drag, which can be a scroll's first few pixels before the slop threshold (card-check passed, so this is by design).
Why the user feels it: on desktop, moving the mouse across the grid starts and abandons several clips; on the phone, a hovered-then-scrolled-away card leaves a buffered clip behind (the IntersectionObserver stop helps). On LAN the bytes are cheap but the decode/buffer work is not free on the phone.
Proposed change: raise `HOVER_DELAY` to 500 ms and fetch the VTT after the delay rather than on enter; set `preload="metadata"` on `PreviewVideo` and let `play()` pull the stream (the first bytes still arrive before the fade-in); consider asking Stash for a smaller sprite (its default sheet is 9×9 of 160×90, 519 kB JPEG is large for that, worth a `?w=` via the resizer, which already handles JPEG → WebP). Effort: S. Confidence: medium (user preference on delay).

### F9. `sizes` reused from the grid on row cards and other non-grid places
Evidence: home row cards are `w-[78vw] sm:w-[300px] xl:w-[320px]` (`Row.tsx:324`) but `SceneCard` always uses `CARD_SIZES` (100vw on phones), so a 686-device-px card gets the 960 variant (1.4×) on the phone; studio logos at 28×8 css get the 320 variant (2–31 kB, 5–11×); tag tiles as in F3.
Why the user feels it: 30–50% more image bytes on Home's rows on the phone (17 images / 413 kB cold; a full row scroll is ~24 × 31 kB per row).
Proposed change: a `sizes` prop on `SceneCard` (`Row` passes `(min-width:1280px) 320px, (min-width:640px) 300px, 78vw`); add a 96-px width to `IMAGE_WIDTHS` for logos/avatars-in-cards (one more cached copy per entity image, made by the nightly warm). Effort: S. Confidence: high.

### F10. API responses are never conditional
Evidence: 0 of N `/api/*` requests served from cache or 304 on a second load of every route; `index.ts:30` only compresses. `/api/home` is 28 kB gzip and 65–204 ms; `/api/tags?perPage=1000` is 11 kB gzip and is fetched on every Browse/Continue/performer/studio/tag open after 5 min (`useTags` staleTime 5 min, used by `useQueryParts` → `PinButton`, mounted on every FilterBar).
Why the user feels it: little on the LAN (the persisted queries paint first and refetch in the background); it matters for the refetch-on-focus storms (every stale list refetches in full when the app returns to the foreground) and would matter on any slower link.
Proposed change: `hono/etag` on `/api/*` (weak ETag over the body; the BFF's data cache makes the bodies stable, so background refetches become 304s); fetch the 1000-tag list only when the Pin popover opens (or derive chip names from the facets you already have). Effort: S. Confidence: medium.

### F11. The Player re-renders four times a second
Evidence: `Player.tsx:255–261` `onTimeUpdate` calls `setTime`, `setBuffered` and `report()` on every `timeupdate` (4 Hz); the component holds 25+ `useState`s and renders the controls, menus and `SeekBar` each time. `nowPlaying.report` dedupes to 0.5 s so the docked `MiniBar` re-renders 2×/s only when docked, which is fine.
Why the user feels it: steady CPU while a video plays, more noticeable with the settings menu or marker chips open, and on the phone in landscape where the page also scrolls.
Proposed change: keep `time`/`buffered` in the `SeekBar` (subscribe to the `<video>` there) or in a small external store with `useSyncExternalStore` selectors so only the bar and the time label re-render. Effort: M. Confidence: medium (not measured under playback since writes are blocked, but the code path is unconditional).

### F12. Studios loads 200 studios and Performers 60 per page, all with logos; fine today
Evidence: /studios 146 `<img>`, 94 kB; /performers 60 avatars per page (640 variants on the phone, 473 kB for 15 fetched). No action needed beyond F9's smaller logo width; noted so it is not re-audited.

## 4. Quick wins (S effort, measurable)

1. `poster={sized(scene.screenshot, 960)}` in `Player.tsx:540`: −130 kB per video open (F7).
2. `React.memo(SceneCard)` + stable `select`/`toggle` props + `useMemo` of the flattened list in `SceneBrowser`: append cost stops growing with the page count (F1).
3. Move the hero index into `Hero`, `React.memo(Row)`: no 65–70 ms long task every 12 s on Home (F2).
4. Reserve space (or move below the grid) for `WantedShelf`, and ship station resumes in the home payload or reserve the row's height: CLS 0.10–0.17 → ~0 (F4).
5. A `sizes` prop on `SceneCard` for rows and a tile-specific `sizes` for tag tiles: −30–60% image bytes on Home rows and Categories on the phone (F3, F9).
6. `HOVER_DELAY` 500 ms, VTT after the delay, `preload="metadata"` on `PreviewVideo` (F8).
7. Render entity headers as skeletons so `SceneBrowser` fetches in parallel (F6).

## 5. Open questions

1. Should Home rows be capped at 12 cards client-side with "See all" for the rest (halves the feed, the DOM and the 12-s re-render)? That is a product choice.
2. Is the Whisparr shelf wanted above the grid (then reserve its height) or below (then no shift at all)?
3. Would a 480-px variant be worth a fourth cached copy per screenshot (desktop 4-column grids render 332–360 px and currently get 640, 1.9×)? Disk cost: one more WebP per screenshot (~20 kB × 2,500 scenes ≈ 50 MB).
4. Stash's sprite sheets are 519 kB JPEGs; is a resized copy through the existing `?w=` path acceptable for the scrub (the player's seek-bar thumbnails use the same sheet)?
5. The Performance-domain heap/listener numbers rose across routes in one Chrome because the previous page stays in the back/forward cache; a leak check needs a single-tab SPA navigation sequence (not done).
6. Not measured: time to first frame and the HLS start-up (writes blocked); hls.js is only loaded for non-Safari HLS, and the direct-play path sets `v.src` immediately with no extra requests before the media.

## 6. Scripts worth keeping

All in `(scratch)/audit/client/` (modelled on `scripts/mobile-check.mjs`, same blocked-URL list, no writes, one Chrome profile per outdir):

- `perf-check.mjs <outdir> <base> <routes…>` (env `W H DESKTOP WAIT SCROLL=<pages> SCROLL_ROUTES=a,b`): per route a cold load (navigation timing, requests and bytes by type, API call sequence with start offsets and durations, five largest responses, first-screen image inventory, CLS/LCP/long tasks, DOM/heap metrics), optional page-by-page scroll costing, then a second load for HTTP-cache hits; writes `result.json` and a screenshot per route. Candidate for `scripts/perf-check.mjs` and `wiki/runbooks/mobile-checks.md`.
- `probe2.mjs <outdir> <base> <routes…>`: true pixel width of each first-screen image's chosen srcset source (naturalWidth lies for `w`-descriptor srcsets), layout-shift sources, Home row/card counts and 13-s idle CPU, Tags tile count, and the exact scroll position at which each next page was requested with the long tasks each append causes.
- `hover-probe.mjs <outdir> <base> /browse` (desktop): bytes for a 3-s hover, a scrub, and a mouse sweep over three cards.
- `analyze.mjs`: prints the per-route tables from the two `result.json` files.
