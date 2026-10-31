---
title: Popovers inside a sideways-scrolling filter row were clipped
kind: gotcha
summary: The original filter strip's popovers lived inside an overflow-x row, which clipped everything below the input so searching showed no results; Round 3 replaced the strip with one portalled dialog.
tags: [css, filters, web, ux]
symptom: "Typing in a filter popover shows no results; the dropdown is cut off below the input"
found: 2026-10-29
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/web/src/components/Filters.tsx]
related: [browse-and-filters, 2026-10-29-round-3]
---

# Popovers inside a sideways-scrolling filter row were clipped

## Symptom

In the Browse filter bar, opening Tags, "+ Filter" or People and typing produced an input
with nothing under it: the result list seemed empty.

## Cause

The chips sat in a row with `overflow-x: auto` so it could scroll sideways on phones. An
overflow value other than `visible` on one axis forces clipping on the other, so the popover
anchored inside the row was cut off at the row's bottom edge. The results were rendered;
they were just invisible.

## Fix

Round 3 (d8ee9cb, 2026-10-29) removed the strip. Every list has a Filters button that opens
one dialog, portalled to `body` (a full-screen sheet on phones), with the search inside it.
See [[browse-and-filters]].

## Avoid

Never anchor a popover inside an element that scrolls on either axis; portal it to `body`
or render it as a sheet.
