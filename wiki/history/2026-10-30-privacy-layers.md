---
title: "2026-10-30: Private session and PIN lock"
kind: history
summary: Phases 2n and 2o: a private session (the ghost) that records nothing for the rest of the visit, and a PIN lock after idle, on returning to the tab, or on L; both browser-side, no login involved.
tags: [history, privacy, lock]
date: 2026-10-30
commits: [4638673, 04bcb6b]
status: record
verified: 2026-10-30
updated: 2026-10-30
related: [private-session, pin-lock, discreet-mode]
---

# 2026-10-30: Private session and PIN lock

## What changed

- **2n, private session** (4638673): the ghost in the header and Settings → Privacy. Nothing
  watched this visit is recorded: no plays, play time or resume points, no station spot, and
  the rating, O, marker and "Mark as watched" actions answer with a toast. Lives in
  sessionStorage so it survives a reload and ends with the tab or the installed app.
  Deliberate acts (favourites, playlists, Not interested, deletes, edits) still go through.
  New writes that record viewing go through `guardWrite()` → [[private-session]].
- **2o, PIN lock** (04bcb6b): Settings → Privacy sets a 4–6 digit PIN (salted SHA-256 in
  localStorage, hashed in plain JS since flix.lan is http and `crypto.subtle` is absent), an
  idle time (1/5/15/30 min or never; a playing video is not idle) and whether coming back to
  the tab locks. `L` locks at once. The lock screen hides the app root outright, pauses every
  video, takes the PIN from a keypad or the phone keyboard, shakes on a wrong try and waits
  30 s after five. A privacy screen, not security, and the copy says so → [[pin-lock]].
- With [[discreet-mode]] from Round 4 these are the three privacy layers, all browser-side.

## How it was verified

Headless: 30 s of playback attempted no write with the private session on, three (play,
activity ×2) with it off. The lock was driven headless through idle, tab return and `L`.

## Snags

None recorded.
