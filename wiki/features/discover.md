---
title: Discover (browse StashDB, pick scenes, Get them)
kind: feature
summary: /discover browses StashDB through flix's mirror by performer, studio, category and words; Select picks up to 200 scenes for the paced Get queue; the Waiting tab lists fetched scenes still without a file.
tags: [stashdb, whisparr, discover, ui]
status: current
verified: 2026-11-09
updated: 2026-11-09
code: [apps/web/src/pages/Discover.tsx, apps/web/src/routes/discover.tsx, apps/web/src/lib/api/discover.ts, apps/web/src/components/WantedRow.tsx, apps/web/src/components/SceneAbout.tsx]
related: [stashdb-mirror, whisparr-shelf, whisparr-sync, mobile-first-ui]
---

# Discover

Reached from the Compass icon in the phone header (the tab bar is full), "Discover" in the
desktop nav, and "Filter on StashDB" on an open performer or studio shelf. The server does all
StashDB work ([[stashdb-mirror]]).

## The StashDB tab

- Filters live in the URL: `q`, `performers`, `studios`, `tags` (StashDB ids, comma-separated, at
  most 10 each; performers and categories must all match, studios any), `sort` (Newest, Just
  added, Trending). Chips name the filters (`selected` from the server); tap one to remove it.
- "+ Performer", "+ Studio", "+ Category" open a sheet that searches StashDB names (400 ms
  debounce, 2 letters minimum) and shows whether the library has that one.
- One entity selected: a card with its picture, network and StashDB count, and "In library"
  linking to the flix page when Stash has it.
- Cards carry the scene's state: Get, Queued, Waiting, Downloading, In library (opens the scene).
  A scene deleted before carries a red "Deleted before" badge and keeps Get
  ([[deleted-scenes-never-refetched-automatically]]). Get on a card fetches that one scene at once. After a Get the card says
  Requested (the server's memory, an hour, lost on restart), then Waiting (monitored, from
  Whisparr) until a download shows; it never offers Get again. A second Get of the same scene
  within the hour starts no second search. _Until 2026-11-02 a Discover card went back to Get
  once the request returned: only the shelf's cached cards were patched._
- **Select**: tap cards to pick (only ones that can be fetched); a bar over the tab bar offers
  "All N" (the loaded ones, up to 200, without those deleted before) and "Get N", which queues them; the server fetches one
  every 8 s.
- The footer says how many scenes match, whether the page came from the mirror or StashDB, and how
  many blocked, VR and (with Not in motion) owned or on-the-way ones were left out.
- **Not in motion** (chip by the sorts, `fresh=1`, since 2026-11-09): keeps only scenes whose
  state is `remote` (StashDB only) or `available` (in Whisparr, never requested); drops owned,
  downloaded, requested, queued, waiting, grabbed and downloading. Filtered after labelling, so a
  page can hold fewer.
- **Show blocked & VR** (chip, `unblocked=1`): blocked and VR scenes too. _Until 2026-11-09 the
  API took `unblocked` but the page had no control for it._
- **Details** (chip, per browser, `flix.discover.details`): each card adds its StashDB categories
  as coloured pills (`CategoryPill`; colour from the name's hash, `lib/color.ts`, the same
  everywhere); a pill links to the library's category when one matches by StashDB id or by name
  or alias (`stash.tagLookup`, one cached query). Off, a mouse hovering the picture shows the pills
  over it, with a stronger background there (alpha 0.36 against 0.16, `categoryStyle(name, bg)`;
  user, 2026-11-09); phones have no hover. _The studio code and StashDB date shown there for an hour on
  2026-11-09 were dropped as noise (user)._
- **Open on StashDB**: every card with a StashDB id (Discover and the not-downloaded shelves) has
  a top-right button opening `<stashdbWeb>/scenes/<id>` in a new tab; `Features.stashdbWeb` is
  the origin of the StashDB endpoint flix uses.
- **About** (ⓘ beside it, since 2026-11-09): StashDB's description of the scene in a popover
  beside the button, no backdrop (`SceneAbout.tsx`). With a mouse it opens on hover after 250 ms
  (so sweeping across cards does not queue StashDB calls) and stays while the pointer is on it;
  on a phone a tap opens it, a tap outside or Esc closes it. _A click-to-open sheet with a dimmed
  page until the user asked for hover, the same day._ `GET /api/discover/scenes/:id/details` reads
  `sdb_scenes.details`; a row stored before that column existed (null) is fetched once through
  the paced queue (`findScene { details }`) and kept; `''` means StashDB has none. New mirror
  rows carry it from `SCENE_FULL`.
- **VR is left out by default** (Settings → Library → "Leave VR scenes out of Discover",
  `settings.hideVr`, since 2026-11-09): `isVrScene` in `catalog.ts` matches the title or a
  category ([VR], (VR), the word VR, Virtual Reality, 180°/360°), or a studio name with VR in
  capitals or starting with "Virtual". Filtered after the page arrives, like blocked ones, so a
  page can hold fewer than 40; "Show blocked & VR" (`unblocked=1`) shows VR too. The daily discovery
  that queues followed performers' new releases does not apply it.

## The Waiting tab

Queued selections (with the queue's last error) and fetched scenes still without a file, newest
first: "Search again" (refused within an hour), "Give up" (unmonitor and forget), remove from
the queue. "Find new releases" runs discovery for followed performers and studios now.
