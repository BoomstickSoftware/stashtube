---
title: A phone-flow tap below an infinite grid lands on a card
kind: gotcha
summary: Tapping the wanted shelf's heading with phone-flow opened a scene, because scrolling the heading into view loaded more library cards under the tap; open things below an infinite grid by script.
tags: [headless, mobile, scripts, whisparr]
status: current
symptom: "tapText \"Not in your library yet\" … path /scene/<id>"
found: 2026-10-31
verified: 2026-10-31
updated: 2026-10-31
code: [scripts/phone-flow.mjs, apps/web/src/components/WantedRow.tsx]
related: [mobile-checks, whisparr-shelf, 2026-10-31-ux-phase5-freshness]
---

# A phone-flow tap below an infinite grid lands on a card

## Symptom

A `{"tapText":"Not in your library yet"}` step on a performer page printed the heading's
rectangle (349x44) but the state after it was `/scene/1587`: the tap opened a library card.

## Cause

`tapText` scrolls the element into view, waits 150 ms, then touches its centre. The wanted
shelf sits **below the library's infinite grid** ([[library-before-wanted-shelf]]); scrolling
to it brings the grid's `Sentinel` into view, the next page of cards arrives in that window,
and the heading has moved down by the time the touch lands, so a card is under the finger.

## Fix

Open the shelf by script, then scroll to what you want to see:

```json
{"eval":"(()=>{const b=[...document.querySelectorAll('button[aria-expanded]')].find(b=>b.innerText.includes('Not in your library'));b?.click();return !!b})()","wait":2500}
```

A screenshot of the open shelf still needs the grid to have finished loading, so pick a
performer with few videos (one page) or scroll by `eval` to the pill you want and wait.

## Avoid

Anything under an infinite grid (the shelf, a page footer) is tapped by script or after the
grid is exhausted; `tapText` is for controls that do not move while they are scrolled to.
