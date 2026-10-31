---
title: iPhone Safari only hides its address bar when the page scrolls
kind: gotcha
summary: Locking page scroll for the sideways full-screen player kept Safari's address bar on screen for good; the page stays scrollable, the player is touch-pan-y, and a swipe up gives the picture the whole screen.
tags: [ios, safari, player, mobile]
symptom: "Safari's address bar never hides over the landscape player"
found: 2026-10-27
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/web/src/components/Player.tsx, apps/web/src/index.css]
related: [player, mobile-first-ui]
---

# iPhone Safari only hides its address bar when the page scrolls

## Symptom

With the phone turned sideways the player filled the screen but Safari's address bar stayed,
eating a strip of the picture, and nothing the user did moved it.

## Cause

Safari collapses its bar only in response to the page scrolling. The first version of the
sideways player fixed itself over the viewport and locked the body scroll, so the page could
never scroll and the bar never went away.

## Fix

The page behind the player is never scroll-locked and the player element is `touch-pan-y`,
so a swipe up over the video scrolls the page a little and Safari hides its bar. A "Swipe up"
hint shows while the bar still takes space. Installed as a web app ([[installable-app]])
there is no address bar and none of this applies.

## Avoid

Never scroll-lock the body on a touch layout that wants the full screen. See [[player]]
and [[mobile-first-ui]].
