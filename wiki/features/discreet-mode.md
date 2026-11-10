---
title: Discreet mode
kind: feature
summary: The Discreet switch (header Privacy menu) that blurs every picture and preview until hovered or focused, kept per browser.
tags: [privacy, discreet, ui]
status: current
verified: 2026-10-31
updated: 2026-11-09
code: [apps/web/src/components/Layout.tsx, apps/web/src/index.css]
related: [private-session, pin-lock, mobile-first-ui]
---

# Discreet mode

The first of three browser-side privacy layers ([[private-session]], [[pin-lock]] are the
others); none needs a login.

## Behaviour

- Toggled in the header's **Privacy** menu ([[navigation]]; _an eye icon of its own until
  2026-11-09_) or the Discreet switch under Settings → Privacy
  ([[settings-page]], since 2026-10-31). Stored as `flix.discreet` in localStorage through
  `useStored`, so it is per browser and survives reloads; the two switches share the key and
  `useStored` keeps them in step.
- `Layout` toggles the `discreet` class on `<html>`; `index.css` blurs every `img` and
  poster-less `video` under `html.discreet` until its link, button or `.group` is hovered or
  focus-within. On a touch screen that means a tap on the card reveals it.
- It hides nothing from the network: pictures still load, so a cold open is as fast as usual.
