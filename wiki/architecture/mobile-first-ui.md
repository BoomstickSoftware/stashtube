---
title: Mobile-first UI rules
kind: architecture
summary: Phones (an iPhone in particular) are the first-class client; the touch and hover variants, input sizes, touch-action, the drag-to-preview convention, safe areas and standalone-mode rules every component follows.
tags: [mobile, touch, ios, css, ux]
status: current
verified: 2026-10-30
updated: 2026-10-31
code: [apps/web/src/index.css, apps/web/src/components/SceneCard.tsx, apps/web/src/components/Layout.tsx]
related: [player, installable-app, mobile-checks, safari-address-bar-needs-page-scroll, grid-column-overflow]
---

# Mobile-first UI rules

**Rule 9: phones are a first-class client** (the user mostly uses an iPhone 17 Pro Max).
Every change is checked headless at that size ([[mobile-checks]]).

## Variants

- **Every control is at least 44 px on touch** (since 2026-10-31, UX audit): `touch:p-3` on
  icon buttons (header, card heart and save), `touch:min-h-11` on `Chip`, `touch:p-2.5` on
  `Stars`, `touch:py-2.5` on the Filters button and the sort pill, `touch:size-10` on the
  "+" filter badges, a padded hit area on the title pencil and the search Clear.
- **The phone layout (icon header, bottom tab bar, docked strip) holds up to `lg`** (1024 px),
  not `md`: a phone in landscape (932 px) hit the desktop breakpoint and the header's Settings
  gear was clipped off-screen by the layout root's `overflow-x-clip`. Tablets in portrait get
  the phone layout too.
- `touch:` (`(pointer: coarse)`, defined in `index.css`) for finger-sized targets and
  touch-only UI.
- `[@media(hover:hover)]:` for anything that may hide until hover. **Never rely on hover to
  reveal a control**; hover-only controls are visible on touch.
- Inputs stay at 16 px or larger on touch screens, or iOS zooms the page.
- Thin controls get a hit area much taller than what is drawn (the seek bar's reaches 28 px
  above the track, [[seek-bar-markers]]). Dragging a position control moves it relative to
  the finger; a tap jumps.
- Gestures that must not pan the page get `touch-action` (`touch-none`, `touch-pan-y`). The
  page itself cannot pan sideways; `mobile-check.mjs` reports horizontal overflow, including
  content clipped at the layout root ([[grid-column-overflow]]).

## Previews on cards

Tube-site convention: on a touch screen a slight drag (10 px) on a thumbnail starts the preview
and swallows the click that ends the drag; a tap still opens the video. One card previews at a
time, and a preview stops once its card is mostly scrolled away (`SceneCard.tsx`). The home
carousel previews the same way. On desktop, moving the mouse across a card scrubs its sprite
frames.

## Layout

- Safe-area padding for landscape and the phone tab bar; the mini-player docks above the tab
  bar ([[mini-player]]).
- Sideways phone: the player goes full-screen with flix's own controls; the page is never
  scroll-locked, so a swipe up hides Safari's address bar
  ([[safari-address-bar-needs-page-scroll]], [[player]]).
- Installed ("Add to Home Screen") flix runs standalone with no browser Back, so the header
  shows one on phones below the top level (`display-mode: standalone`) ([[installable-app]]).
- Dialogs that need the keyboard (the playlist menu, the Filters sheet) survive it opening;
  the Filters dialog is a full-screen sheet portalled to `body` on phones
  ([[filter-popovers-clipped-in-scroll-row]]).
- Controls that need a keyboard elsewhere (speed, Mark this moment) live in the player's
  settings menu on a phone; marking is a half-second hold on the picture ([[long-press-to-mark]]).
