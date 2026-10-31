---
title: Settings page
kind: feature
summary: One page in five headed groups (Library, Feed, Playback, Privacy, Advanced) with a sticky strip of in-page links; what each group holds, which settings are shared and which stay in the browser.
tags: [settings, ui, privacy, cleanup]
status: current
verified: 2026-10-31
updated: 2026-10-31
routes: [/settings]
api: [GET /api/settings, PUT /api/settings, GET /api/blocklist, GET /api/scenes/hidden, GET /api/admin/cache]
code: [apps/web/src/pages/Settings.tsx, apps/web/src/components/Privacy.tsx, apps/web/src/components/FeaturedDials.tsx, apps/web/src/components/CachePanel.tsx, apps/web/src/components/Shortcuts.tsx]
related: [settings-next-to-page, library-tools-group-in-settings, panic-key-desktop-only, blocklist-and-exclusions, featured-ranking, private-session, discreet-mode, pin-lock, cache-admin, diagnostics, keyboard-shortcuts]
---

# Settings page

`/settings` (the gear in the header) is one page, per [[settings-next-to-page]]: only what is
global or device-wide lives here; what changes one page sits on that page (the player's gear
menu, the Performers switch). Since 2026-10-31 it has an `h1`, five headed groups and a strip
of in-page links that sticks under the header ([[library-tools-group-in-settings]]); _before,
it was eleven untitled sections in one 3,600 px column that opened on the Clean up card_.

## Groups

| Group | Holds | Stored |
|---|---|---|
| **Library** | the Clean up and Duplicates cards (their only entry points, [[cleanup-page]], [[duplicates-workbench]]); the Blocklist (search to block, chips to unblock, grouped Categories / Performers / Studios, [[blocklist-and-exclusions]]); Not interested (shown only when a video is marked) | Postgres `blocks`; the Not interested tag in Stash |
| **Feed** | Performer preferences (age at filming, ethnicity: defaults for every list, the home feed and related videos); Featured dials with a live preview and a Save button that toasts "Saved" ([[featured-ranking]]) | `settings` table (`people`, `featured`) |
| **Playback** | Start playing when I open a video; Keep playing while browsing ([[mini-player]]). Quality, speed and intro skip are in the player's gear menu | `playOnOpen` shared; Keep playing per browser |
| **Privacy** | Private session (same switch as the header's ghost, [[private-session]]); Discreet (same switch as the header's eye, [[discreet-mode]]); PIN lock ([[pin-lock]]) | sessionStorage; localStorage `flix.discreet`; localStorage |
| **Advanced** | Panic key with its "Go to" URL and Keyboard shortcuts, both `touch:hidden` ([[panic-key-desktop-only]], [[keyboard-shortcuts]]); Cache ([[cache-admin]]); Diagnostics ([[diagnostics]]); Sign out when a login is set ([[optional-login]]) | `panicUrl` shared |

## How the page is built

- `GROUPS` in `Settings.tsx` names the five ids; each `Group` is a `section` with
  `scroll-mt-32` so a jump lands the heading under the 64 px header and the 44 px strip.
- The strip is plain `<a href="#id">` links (no router navigation), `touch:min-h-11`,
  horizontally scrollable on phones.
- Two components hold the same localStorage key (the header's eye and the Discreet switch):
  `useStored` announces every write on `window` (`flix:stored`) and every other holder of the
  key re-reads, so both switches move together (`lib/storage.ts`, since 2026-10-31).
- Headings: `h1` Settings, `h2` per group, `h3` per section, `h4` inside Privacy and the
  Blocklist; the shortcut groups keep their `h3`s.

## Copy rules applied here

US spelling and "Categories" ([[categories-and-us-spelling]]); device-neutral verbs ("click
or tap it to go back"); the Clean up card says what it finds; the PIN fields are "New PIN ·
Repeat PIN · Set PIN"; the cache button is "Clear all caches…" and confirms first; the cache
blurb names the 10-minute idle gate of the change check ([[caching]]).
