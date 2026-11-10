---
title: UI system
kind: architecture
summary: The tokens, primitives and motion every screen is built from (colours, type, layers, press and focus states, the one Sheet, toasts, Undo), and the rules for adding to them.
tags: [ui, ux, mobile, touch, web]
status: current
verified: 2026-11-10
updated: 2026-11-10
code: [apps/web/src/index.css, apps/web/src/components/ui.tsx, apps/web/src/components/Sheet.tsx, apps/web/src/lib/hooks.ts, apps/web/src/lib/toast.ts, apps/web/src/router.tsx]
related: [mobile-first-ui, ux-delight-principles, web-app, iphone-first-polish, 2026-11-10-ux-revamp]
---

# UI system

Built 2026-11-10 ([[2026-11-10-ux-revamp]]) against [[ux-delight-principles]]. Touch rules are in
[[mobile-first-ui]]; this page is what to reach for.

## Tokens (`index.css`)

- **Colour**: `bg`, `surface`, `raised`, `line`, `muted`, `fg`, `accent`, `star`, plus meaning:
  `danger`, `warn`, `private`, `ok`, and `scrim` for every overlay's backdrop. New code uses
  `text-danger`, not `text-red-400`.
- **Type**: `text-micro` (11 px) and `text-meta` (13 px) under Tailwind's scale; no
  `text-[11px]`. The face is the system font (nothing loads a web font).
- **Layers**: `z-(--z-header)`, `--z-tabbar`, `--z-dock`, `--z-bulk`, `--z-toast`, `--z-sheet`,
  `--z-dialog`, `--z-lock`. Anything fixed takes one; no new `z-[NN]`.
- **Heights**: `--tabbar-h` (0 from `lg` up), `--dock-h` (the docked mini-player, set by
  `html.has-dock`), `--header-top` (where a bar sticks under the header; 0 while the header is
  scrolled away). What floats at the bottom sits at `bottom-[calc(var(--tabbar-h)+var(--dock-h))]`.
- **Motion**: `--ease-standard`, `--ease-emphasized`, `--ease-exit`; `animate-sheet-up`,
  `animate-pop-in`, `animate-scrim-in`, `animate-pop`, `animate-toast-in`. About 100 ms for a
  press, 160–240 ms for a surface; reduced motion cuts all of it.

## Behaviour every control has

- **Press**: every `button`, `[role=button]`, tab, switch and `a.press` dips to 96% while the
  finger is down (a global rule, `scale` so it never fights a translate). `press-soft` on a wide
  surface dips less. Nothing needs its own `active:` class.
- **Focus**: a 2 px accent ring on `:focus-visible` for every link and button.
- **Hover** styles are Tailwind's `hover:`, which v4 applies only where hover exists.

## Primitives

| Use | For |
|---|---|
| `Button` (`ui.tsx`) | a labelled action; `variant` ghost, solid (white: play), accent (commit), danger |
| `IconButton` | an icon alone: 36 px with a mouse, 44 px under a finger, `label` required |
| `Chip`, `Switch`, `Stars` | filters, toggles, rating (the star tapped pops) |
| `Sheet` (`Sheet.tsx`) | any menu or short form: rises on a phone with a grabber, drags down to dismiss, pops in centred with a mouse; `size` menu or form |
| `useModal`, `useSheetDrag`, `SheetGrabber` | a dialog that builds its own panel (the card menu, Filters, Delete) gets the same Esc, scroll lock, focus return and drag |
| `sheet-scrim` + `sheet-panel` classes | the entrance for those panels |
| `showToast(text, action, ms)` | up to three stack, above the tab bar and the dock |
| `UndoButton` | the action in a toast that takes it back |
| `Segmented` | one of a few choices side by side (views, modes, tabs); the only shape for it |
| `ActionSheet`, `RenameSheet` (`Sheet.tsx`) | a "⋯" menu of a card or row; one name to change |
| `ListSkeleton` | rows of a picture and two lines while a list loads |
| `PullToRefresh` | installed app only: pull down at the top to refetch the page |
| `Bone`, `ErrorBox`, `PageError`, `Empty` | loading, a failed read, a render error, nothing here |

## Rules

- A reversible action gets an Undo toast, never a confirm. A confirm dialog is for what cannot
  be undone (Not interested: delete). No `window.confirm` remains.
- A skeleton has the shape of what it stands for (Home: a hero and rows).
- One sheet at a time; it has a visible close as well as the swipe.
- Page changes cross-fade in 160 ms (`defaultViewTransition`). One thing more moves: a tapped
  card's picture grows into the player (`.vt-media`, one element at a time may carry the name;
  on the video page it is the slot, which has its size at once, never the host laid over it).
- A sheet rises above the on-screen keyboard (`useKeyboardInset`): iOS lays the keyboard over
  the page, so a field at the bottom of the screen would sit behind it.
- A card or row has at most one "⋯"; its less frequent actions live in that sheet.
- The header slides away on a phone while scrolling down and returns on the first scroll up
  (`useScrolledAway`).

## Not yet migrated

About 130 raw `<button>` elements still carry their own classes (menu rows, chips, the players'
controls); they get the press and focus behaviour globally, not the shared look. Migrate a screen
when it is touched ([[roadmap]]).
