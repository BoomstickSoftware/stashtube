---
title: Navigation
kind: feature
summary: Five tabs (Home, Browse, Stations, Discover, You), the header (Search, one privacy menu, Settings), Browse's section strip and the You hub; which paths light which tab.
tags: [navigation, ui, mobile]
status: current
verified: 2026-11-09
updated: 2026-11-09
routes: [/, /browse, /performers, /studios, /tags, /stations, /discover, /you]
code: [apps/web/src/components/Layout.tsx, apps/web/src/components/PrivacyMenu.tsx, apps/web/src/components/BrowseStrip.tsx, apps/web/src/pages/You.tsx, apps/web/src/lib/recent.ts, apps/web/src/pages/Stations.tsx, apps/web/src/components/ManageRows.tsx]
related: [five-tab-navigation, mobile-first-ui, stations, vault, continue-history-stats, private-session, discreet-mode, pin-lock, settings-page, home-feed]
---

# Navigation

Built 2026-11-09 from decision [[five-tab-navigation]] ([[2026-11-09-navigation]]). Every URL
from before still works.

## Tabs

The phone's bottom bar and the desktop's top nav hold the same five (`nav` in `Layout.tsx`; on
the desktop the logo is Home). A tab stays lit on every path it owns (`tabOf`):

| Tab | Owns |
|---|---|
| Home | `/` |
| Browse | `/browse`, `/performers`, `/studios`, `/tags`, and `/performer/…`, `/studio/…`, `/tag/…`; badge: stacked filters |
| Stations | `/stations`, `/station` |
| Discover | `/discover` |
| You | `/you`, `/continue`, `/history`, `/stats`, `/playlists`, `/playlist/…`, `/vault`; a dot (phone) or count (desktop) while Continue holds videos |

Settings, Clean up, Duplicates and the video page light none. _Until 2026-11-09_ the phone had
seven tabs (Home, Browse, Continue, Performers, Studios, Categories, Playlists) and Discover,
Stations and the Vault as unlabelled header icons.

## Header

Search, **Privacy** and Settings (plus Back when installed). Privacy (`PrivacyMenu.tsx`) opens
Discreet and Private session switches ([[discreet-mode]], [[private-session]]) and **Lock now**
when a PIN is set, else "Set a PIN to lock flix…" to Settings ([[pin-lock]]). Its icon shows what
is on: the violet ghost (private), the crossed eye (Discreet), a shield otherwise. _Discreet and
Private were two header toggles before._

## Browse strip

`BrowseStrip` at the top of `/browse`, `/performers`, `/studios`, `/tags`: Videos · Performers ·
Studios · Categories (the directory pages keep a hidden `h1`).

## You

`/you`: Continue watching (count), History, Stats; Favorites (its count) and Playlists; Vault,
Hidden and blocked (Settings `#hidden`), Settings. Each row opens the page it names.

## Stations: Start from

The Station chips on lists (filter bar and its phone "More" sheet, so entity pages too), the
video page's Related header and Home's "Because you watched" row are gone. The Stations tab's
**Start from** offers the same in one tap (`lib/recent.ts`, localStorage):

- **The list you were on**: the last list's filters as `SceneBrowser` ran them (not Cleanup),
  shown only when it had filters (an unfiltered one is the Everything quick start).
- **Drift from the last video**: the last video page opened (`/station?from=`).

## Settings › Feed › Home rows

`ManageRows.tsx` (`#home-rows`): the pinned rows in Home's order with rename, move up / down and
unpin (toast with Undo, which pins it again as a new row at the end). Home's own row controls
stay ([[home-feed]]).
