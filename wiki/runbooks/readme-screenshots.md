---
title: Take the README screenshots without exposing the library
kind: runbook
summary: How the public README's phone screenshots are made with phone-flow against production read-only, discreet mode on and every title, name and video frame blurred by injected CSS, and which pages are safe to show.
tags: [readme, screenshots, discreet, phone-flow, public]
status: current
verified: 2026-11-01
updated: 2026-11-01
code: [scripts/phone-flow.mjs, docs/screenshots, README.md]
related: [github-public-mirror, mobile-checks, discreet-mode, prod-checks-read-only]
---

# Take the README screenshots without exposing the library

The repo is public ([[github-public-mirror]]) and the library is adult, so a screenshot must
show no picture, title, performer, studio or station name. Discreet mode
([[discreet-mode]], `localStorage['flix.discreet']='true'`) blurs pictures and previews but
**not text and not the player's `<video>`**, so the run injects a style as well.

## Steps

1. `FLIX_SERVER=http://flix.lan pnpm --filter @flix/web exec vite --port 5174 --strictPort`
   (production, read-only: phone-flow blocks every write, [[prod-checks-read-only]]).
2. Run `scripts/phone-flow.mjs` with an `eval` step before each `shot` that sets the discreet
   key and appends a `<style>` blurring `.group > .mt-2\.5, .line-clamp-2, .line-clamp-1,
   h1.group\/title, h1 ~ div.truncate, span.truncate, span.truncate b, video,
   p.whitespace-pre-line, .font-semibold.break-words, button.truncate.font-semibold,
   .group > div.mt-2.font-semibold` with `filter: blur(7px)`, and adds the class to any `h2`
   starting "Because you watched". A `goto` after the first `eval` is needed so the discreet
   class is applied from storage on load; run the `eval` again after each `goto` and `scroll`.
3. **Look at every image before it enters the repo** (Read the PNG). On 2026-11-01 the first
   pass leaked the hero's studio and performer line, station names and resume titles, and an
   unblurred video poster; the selectors above are what fixed them.
4. `sips -Z 1100 <shot> --out docs/screenshots/<name>.png` (half size, ~150 KB each).

## Pages

Safe with the recipe: `/`, `/` scrolled 900 px, `/browse`, `/scene/<id>`, `/stations`,
`/continue`, `/settings`. **Not safe**: the Filters sheet (category chips are explicit tag
names), `/performers`, `/studios`, `/categories`, any performer or studio page.
