---
title: Keyboard shortcuts
kind: feature
summary: Every key flix answers to, grouped as the ? overlay shows them, with where each is handled.
tags: [keyboard, player, stations, ui]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/web/src/components/Shortcuts.tsx, apps/web/src/components/Player.tsx, apps/web/src/pages/Station.tsx, apps/web/src/components/Layout.tsx, apps/web/src/lib/lock.ts]
related: [player, stations, pin-lock, search]
---

# Keyboard shortcuts

`?` opens the list anywhere (`components/Shortcuts.tsx`; also under Settings). Keys are ignored
while typing in an input, and the player's keys unbind while it is docked ([[mini-player]]).

## Anywhere

| Key | Does |
|---|---|
| `/` | Focus search ([[search]]) |
| `?` | This list |
| `L` | Lock flix (with a PIN set, [[pin-lock]]) |
| `Esc Esc` | Panic: mute and pause every video, hide the page and `location.replace` to the Settings panic URL (default google.com), within 400 ms |

## Playing a video ([[player]], YouTube conventions)

| Key | Does |
|---|---|
| Space / `k` | Play / pause |
| `←` `→` | ±5 s |
| `j` / `l` | ±10 s |
| `0`–`9` | Jump to that tenth |
| `↑` `↓` | Volume |
| `m` | Mute |
| `<` `>` | Speed |
| `f` | Fullscreen |
| `t` | Theater |
| `i` | Picture in picture |
| `Shift+N` | Next video |
| `b` | Mark this moment ([[moments]]) |
| `[` `]` | Previous / next marker |

## On a station ([[stations]])

| Key | Does |
|---|---|
| Space / `k` | Play / pause |
| `←` `→` | ±5 s; `j` / `l` ±10 s |
| `n` / `p` | Next / previous video (arrow right skipped videos until 2026-10-29) |
| `b`, `[` `]` | Mark; previous / next marker |
| `q` | The station list panel |
| `m` | Mute |
| `Esc` | Leave the station |
