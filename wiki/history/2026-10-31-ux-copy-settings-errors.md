---
title: "2026-10-31: UX audit copy pass, Settings in five groups, actionable errors"
kind: history
summary: The Categories / US spelling / Follow vocabulary applied across the UI, Settings regrouped under a sticky anchor strip with a Discreet switch, Stash and network errors reworded, the dead Whisparr activity hook removed.
tags: [ux, settings, copy, errors, audit]
status: record
date: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
related: [2026-10-31-ux-audit, categories-and-us-spelling, library-tools-group-in-settings, failed-writes-toast-only, settings-page, web-app, roadmap]
---

# 2026-10-31: UX audit copy pass, Settings in five groups, actionable errors

The copy, Settings and error-message lines of Phases 4 and 5 in [[roadmap]], from
[[2026-10-31-ux-audit]] (desktop §4 and findings 7, 8, 11, 16; IA F2, F9, F12, F14, F15, F19;
phone 14), under the decisions [[categories-and-us-spelling]],
[[library-tools-group-in-settings]], [[failed-writes-toast-only]] and [[panic-key-desktop-only]].

## What changed

- **Vocabulary** ([[categories-and-us-spelling]]): "Favourite(s)" and "centre" are gone from
  the UI. Everything derived from Stash's performer favourite says Follow: the filter chip and
  the station quick start are "Performers I follow", the Home row is "New from performers you
  follow" (`api.ts`), the Featured dials are "Performers you follow", "Pinned categories",
  "Studios you follow" and the `why` lines "a performer you follow", "a pinned category", "a
  studio you follow" (`featured.ts`, test updated). "Categories" in the Blocklist group, the
  Filters dialog (group, hint, placeholder, Show blocked), search subtitles, "Edit categories"
  and "Add a category…" on the scene page. "Most videos" for the performer sort. Device-neutral
  verbs in Filters, Clean up and Settings. The scene page's third "Save" is "Playlist", the
  station's is "Save station", the details toggle "Show file and links", the O button "Count an
  O here (adds a marker)". Shortcut labels "Jump to 0–90 %", "Show the station list", "Panic:
  leave flix for the page in Settings". Pages owned by other streams were left alone (see
  Snags).
- **Settings** ([[settings-page]]): `h1`, five groups (Library, Feed, Playback, Privacy,
  Advanced) with a sticky strip of anchors; Clean up and a new Duplicates card open the Library
  group; a Discreet switch under Privacy mirrors the header's eye (`useStored` now syncs holders
  of one key through a `flix:stored` event); Featured's button is "Save" with a "Saved" toast;
  PIN fields "New PIN · Repeat PIN"; the panic URL field is labelled "Go to"; the cache button is
  "Clear all caches…" (the confirm existed) and its blurb names the 10-minute idle gate.
- **Errors** ([[web-app]]): `describeError` in `client.ts` turns a `Stash:` 502 into "Stash is
  busy or down (a scan locks it for a few minutes). Cached pages still work." (raw message in a
  smaller line), a fetch `TypeError` / `AbortError` into "No connection to flix. Check Wi-Fi,
  then try again.", a client timeout into "flix took more than 65 s to answer". The failed-write
  toast uses the same mapping ("Nothing was saved; try again later"). The client timeout went
  45 s → 65 s so the server's 60 s Stash budget always answers first.
- **Dead code**: `useWhisparrActivity` removed from `lib/api/whisparr.ts`; the server route
  `/api/whisparr/activity` stays, uncalled ([[whisparr-shelf]]).

## How it was verified

`node scripts/check.mjs` (typecheck both apps, lint at the 5-warning baseline, 86 server tests).
Headless against a Vite dev server on 5181 proxied read-only to production: `desktop-check`
(the strip sticks at y=64, an anchor click lands the Privacy heading at y=128, the Filters
dialog shows "Categories" and no "Tags", the `?` overlay and the Stations page show the new
labels) and `phone-flow` (the Panic section is `display: none` on touch; no new target under
44 px).

## Snags

- The decision pages had landed on `main` one commit after the worktree branched; the branch
  was fast-forwarded before starting.
- Strings in files owned by other streams were not touched and are listed in [[roadmap]]
  under Phase 5: `Home.tsx` "New from your favourites, not downloaded", `Tag.tsx` eyebrow
  "#", `Player.tsx` O button title "Count an O at this moment", `Directories.tsx` Studios
  table header case, `WantedRow.tsx` / `Home.tsx` hint "Get fetches one scene".
