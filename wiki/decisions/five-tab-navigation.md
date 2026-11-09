---
title: Five tabs, a You section and one privacy menu
kind: decision
summary: The phone's tabs become Home, Browse, Stations, Discover and You, with Performers, Studios and Categories inside Browse and one privacy menu in the header.
tags: [navigation, ui, mobile, stations]
status: current
decided: 2026-11-09
by: user
verified: 2026-11-09
updated: 2026-11-09
related: [mobile-first-ui, iphone-first-polish, stations, stations-only-user-made, hide-means-delete-block-or-unlist, 2026-11-09-strategy-review]
---

# Five tabs, a You section and one privacy menu

**Decided** 2026-11-09 by the user (strategy review). **Status** current; not built yet
(initiative G of [[roadmap]]).

## Context

On the phone the tab bar held seven items (Home, Browse, Continue, Performers, Studios,
Categories, Playlists) and the header up to eight icons (Back, Search, Discover, Stations, Vault,
Discreet, Private, Settings); Stations, Discover and the Vault were unlabelled icons only.

## Decision

- **Tabs**: Home · Browse · Stations · Discover · **You**.
- **Browse** carries a segmented strip: Videos | Performers | Studios | Categories.
- **You**: Continue, History, Playlists (Favorites first), Stats, and the hidden lists (Vault
  and Blocked, [[hide-means-delete-block-or-unlist]]).
- **Header**: Search, one privacy menu (Discreet, Private session, Lock now), Settings.
- The ad-hoc "Station" chips (filter bar, entity pages, by Related) fold into the Stations tab
  (start a station from the current filters there), which settles the open backlog question.
- The scene page keeps Stars, O, Favorite and Playlist in its row; the rest goes in a "⋯" sheet
  shared with the card menu.

## Consequences

Desktop follows the same grouping in its top nav. URLs stay (`/continue`, `/performers`, …), so
links and history keep working.

## Revisit if

A section under You turns out to be used daily from the phone and wants its own tab back.
