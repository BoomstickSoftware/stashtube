---
title: Add a 480 px image variant
kind: decision
summary: The resized-image ladder gains 480 px (320, 480, 640, 960) so desktop four-column grids stop fetching 640 px copies at 1.9×; one more WebP per screenshot, about 50 MB.
tags: [images, performance, cache]
status: current
decided: 2026-10-31
by: user
verified: 2026-10-31
updated: 2026-10-31
related: [media-proxy, caching, 2026-10-31-ux-audit]
---

# Add a 480 px image variant

**Decided** 2026-10-31 by the user (UX audit decision 11, [[2026-10-31-ux-audit]] client Q3).
**Status** current.

## Context

The ladder was 320 / 640 / 960. A desktop four-column grid card renders at 332–360 CSS px,
so `srcset` picked the 640 px copy at 1.9× the need. The cost of a fourth copy is one more
WebP per screenshot, roughly 20 KB × 2,500 scenes ≈ 50 MB on the asset cache's disk.

## Decision

`IMAGE_WIDTHS = [320, 480, 640, 960]` in `@flix/shared`; the server accepts `?w=480` on
`/media/stash` and `/media/remote`, `srcSet()` lists it, and the browser picks it from `sizes`.

## Consequences

The asset cache grows by up to ~50 MB over time (resizes happen on demand). Nothing else
changes; `sized(url, 480)` is available where a fixed width fits.

## Revisit if

the asset cache's disk cap ([[caching]]) starts evicting because of the extra copies.
