---
title: Discreet mode
kind: feature
summary: The eye in the header that blurs every picture and preview until hovered or focused, kept per browser.
tags: [privacy, discreet, ui]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/web/src/components/Layout.tsx, apps/web/src/index.css]
related: [private-session, pin-lock, mobile-first-ui]
---

# Discreet mode

The first of three browser-side privacy layers ([[private-session]], [[pin-lock]] are the
others); none needs a login.

## Behaviour

- Toggled by the **eye** in the header. Stored as `flix.discreet` in localStorage through
  `useStored`, so it is per browser and survives reloads.
- `Layout` toggles the `discreet` class on `<html>`; `index.css` blurs every `img` and
  poster-less `video` under `html.discreet` until its link, button or `.group` is hovered or
  focus-within. On a touch screen that means a tap on the card reveals it.
- It hides nothing from the network: pictures still load, so a cold open is as fast as usual.
