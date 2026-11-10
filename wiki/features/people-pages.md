---
title: Performer, studio and tag pages
kind: feature
summary: The entity pages and directories, what follow, pin and block mean on each, the gender switch, age at filming, studio families and the three Studios views.
tags: [performers, studios, tags, directories, favorites]
status: current
verified: 2026-10-31
updated: 2026-11-09
routes: [/performers, /performer/$id, /studios, /studio/$id, /tags, /tag/$id]
api: [GET /api/performers, GET /api/performers/:id, PUT /api/performers/:id/favorite, PUT /api/performers/:id/rating, GET /api/studios, GET /api/studios/:id, PUT /api/studios/:id/favorite, PUT /api/studios/:id/intro, GET /api/tags, GET /api/tags/tiles, GET /api/tags/:id, PUT /api/tags/:id/favorite, PUT /api/blocklist/:kind/:id]
code: [apps/web/src/pages/Directories.tsx, apps/web/src/pages/Performer.tsx, apps/web/src/pages/Studio.tsx, apps/web/src/pages/Tag.tsx, apps/web/src/components/EntityHeader.tsx, apps/web/src/components/People.tsx, apps/server/src/api.ts]
related: [browse-and-filters, whisparr-shelf, library-before-wanted-shelf, categories-and-us-spelling, blocklist-and-exclusions, stash-owns-activity, playlists-and-favorites, stations, gender-switch-performers-page-only]
---

# Performer, studio and tag pages

Each entity page is a header, actions, the entity's videos through the shared list
([[browse-and-filters]]), and for performers and studios, below the videos, a collapsed "Not
in your library yet" shelf ([[whisparr-shelf]], [[library-before-wanted-shelf]]).

The grid renders, and fetches, from the first paint: `SceneBrowser`'s `base` needs only the
id, so it does not wait for the record. Until the record arrives the header is a
`HeaderSkeleton` (`EntityHeader.tsx`) of the same shape as the real one (portrait or logo
block, name bar, facts line, three button pills), so nothing moves when the name fills in;
_until 2026-10-31_ the whole page was a centred spinner until `/api/<kind>/:id` answered, and
the first scenes request started only then. A failed record still shows the `ErrorBox` alone.
The tag page's eyebrow says "Category" ([[categories-and-us-spelling]]; _"#" until
2026-10-31_).

## Follow from any list

Every list of performers, studios or categories carries the same heart as the entity page's
Follow button (`FollowHeart` in `EntityHeader.tsx`, since 2026-11-02): over the picture on
performer cards and category tiles, in the name row on studio tiles (so logos stay whole; the
count moved to the line below), and in the table's own column. On touch screens it always
shows, 44 px; with a mouse it appears on hover unless followed. A tap follows without opening
the page. Each directory also has a "Following" chip. Before this, studios could be followed
only from their page or the table view.

## Actions on an entity

- **Follow** (heart): Stash's performer or studio favourite, so Stash's UI agrees
  ([[stash-owns-activity]]). With the follow sync on, a followed performer's new releases are
  monitored in Whisparr and the page shows "Watching for new scenes" ([[whisparr-sync]]). Video hearts are different: a flix playlist
  ([[playlists-and-favorites]]).
- **Rating** (performers), **Block** (never download more of them; their videos you have still show,
  [[blocklist-and-exclusions]]; one tap, then a toast "Blocked: flix won't download more of
  <name> · Undo"; _hid them everywhere until 2026-11-09_), **Add to
  filters** (stacks it, [[browse-and-filters]]), **Station** from this entity's videos
  ([[stations]]).
- **About** (performers): a ghost `Button` like its neighbours, with the number of facts and
  `aria-expanded` (_muted text that read as a label until 2026-10-31_). Open, it shows the
  facts grid (born, ethnicity, hair, eyes, height, measurements, breasts, tattoos, piercings),
  the biography and a **Links (N)** disclosure. The links are Stash's URL list deduped by host
  and path (`www.`, trailing slash and case ignored), labelled by host and numbered when a host
  has several pages ("iafd.com (2)"); a malformed URL is dropped. Hidden when there is nothing
  to show.
- Studios: **intro skip** in seconds, honoured by every player and by Start over
  (`PUT /api/studios/:id/intro`, 0–600). It is set from the player's gear menu ("Skip to
  here") while one of the studio's videos plays (`Player.tsx`, `useIntroSkip`); the studio
  page itself has no control for it (_this page said it did until 2026-10-31_). A studio page
  includes its sub-studios.
- Tags: **Follow** = Stash's tag favourite (_"Pin" until 2026-11-02_); followed categories head the Categories page.

## Directories

- **Performers**: sort by videos, name or random; **Following** filter; the Women / Men /
  Everyone switch, captioned "Only this page": it filters **this directory alone**
  (`GET /api/performers?gender=`, `all` when absent) and is kept per browser
  (`flix.performers.gender` through `useStored`), per [[gender-switch-performers-page-only]].
  _Until 2026-10-31_ it was the `performerGender` setting and also steered Home's "For you" and
  "More with", Stats, search suggestions and the People filters; the setting is still accepted
  by `PUT /api/settings` and stored, but nothing reads it. A performer's page shows her age at
  filming on each card (`ageAt` from birthdate and scene date).
- **Studios**: **Networks** (each network heads its sub-studios with an "All of …" tile for the
  combined feed; independents last; a text filter shows the flat grid), **Grid** and **Table**
  views; sort by Most videos or Name; Following. Kept per browser. Counts include sub-studios
  (`scene_count(depth: -1)`). Studio tiles are transparent logos.
- **Categories** (tags): tag tiles with a picture, warmed at boot ([[caching]]); followed first, and a "Following" chip (kept per browser) shows only those.
- While a directory's first page loads it shows **tile skeletons** in its own grid (12
  portraits; 10 studio tiles, or 10 table rows in Table view; 12 big and 16 small category
  tiles), `role="status"`, pulsing, still under reduced motion (since 2026-10-31, _a lone
  spinner before_). The shared `Bone` lives in `components/ui.tsx`.

## Where

`pages/Directories.tsx` holds all three directories; `EntityHeader.tsx` the shared header.
Blocked ids are dropped after each finder query ([[stash-filters-have-no-id-criterion]]).
