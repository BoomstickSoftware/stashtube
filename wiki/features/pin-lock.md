---
title: PIN lock
kind: feature
summary: A 4–6 digit PIN that locks flix after idling, on returning to the tab or on L, how it is stored and why it is a privacy screen rather than security.
tags: [privacy, pin, lock, ui]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/web/src/lib/lock.ts, apps/web/src/components/PinLock.tsx, apps/web/src/index.css]
related: [discreet-mode, private-session, keyboard-shortcuts, single-user-no-login]
---

# PIN lock

Settings → Privacy sets a PIN and when it locks. It is a **privacy screen, not security**, and
the lock screen's copy says so: clearing the site's data removes it.

## Behaviour

- **PIN**: 4–6 digits, stored in localStorage (`flix.pin`) as a salted SHA-256 with its
  length, idle minutes and lock-on-return flag. The hash is plain JS because `crypto.subtle` is
  absent on http origins such as flix.lan ([[lan-only-no-ingress]]).
- **Locks** after the chosen idle time (1 / 5 / 15 / 30 min or never; a playing video is not
  idle), when the tab comes back after more than 3 s hidden (if lock-on-return is on), or at
  once on `L` ([[keyboard-shortcuts]]). With no PIN set, nothing locks.
- **While locked** the app root is `visibility: hidden` (`html.locked`), not merely covered,
  under a full-screen keypad (phone keyboard works too); every video pauses and nothing resumes
  on unlock. A wrong try shakes; after five, a 30 s wait counted down on screen.
- The locked flag is in sessionStorage (`flix.locked`), so a reload stays locked and a fresh
  visit starts unlocked.

It is not a login ([[single-user-no-login]]); the optional password is a different thing
([[optional-login]]).
