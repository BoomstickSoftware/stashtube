---
title: Log
kind: hub
summary: Append-only record of wiki operations (init, ingest, correct, decide, lint, query), newest last.
tags: [wiki, meta]
status: current
verified: 2026-10-30
updated: 2026-10-30
---

# Log

One entry per operation, appended at the end: `## [YYYY-MM-DD] <op> | <title>` and one to
three lines. `grep '^## \[' wiki/log.md | tail -5` shows the latest. See [[CONVENTIONS]].

## [2026-10-30] init | Wiki created
Conventions, tooling (`scripts/wiki.mjs`) and the first pages. Sources migrated: the former
25 KB `CLAUDE.md`, `docs/plan.md` (now history pages and `roadmap`), the flix-facing rows of
`nas:docs/services.md` and `nas:docs/known-issues.md` #40, `k8s:docs/flix.md`, and the agent's
memory notes about flix.

## [2026-10-30] correct | Verified the writers' unsourced facts against the code
Test count 59 → 69; the quality menu's stall window is 30 s; the scene page's O button creates an
`O` marker after 3 s of play; four gotcha `symptom` lines were guessed error messages and now
describe the observed symptom instead, with `found:` marked inferred where it came from the fixing commit.

## [2026-10-30] ingest | Relative scrubbing and picture swipe
Seek bar: taller touch area, relative 1:1 drag, tap to jump; a sideways swipe on the picture
scrubs ([[2026-10-30-relative-scrubbing]]). Corrected [[run-checks]] and
[[coding-conventions]]: `pnpm typecheck` skips the web app, and lint has 5 known warnings.

## [2026-10-30] query | How the installed iOS app gets a new build
No service worker; `index.html` has no `cache-control`, iOS resumes the suspended app, and a
missing chunk is answered with `index.html` → [[installable-app#how-a-deploy-reaches-it]].

## [2026-10-30] ingest | The open app follows deploys
Page names its build and is `no-cache`, missing assets 404, `lib/update.ts` reloads with loop
limits → [[installable-app#how-a-deploy-reaches-it]], [[2026-10-30-app-follows-deploys]].

## [2026-10-31] ingest | Review round: eight initiatives
Resized thumbnails, request guard, Home state, cache correctness, blocklist and Continue data
quality, ghost sweep, instant scene opens, Related fallback → [[2026-10-31-review-round]];
new page [[request-guard]]; corrected [[media-proxy]] (CORS was `*`) and [[home-feed]] (seed).

## [2026-10-31] decide | Playlists ignore the blocklist; only stations you made are remembered
Two user decisions → [[playlists-ignore-blocklist]], [[stations-only-user-made]]; Continue's 13
finished resume points cleared; Featured pool slimmed → [[2026-10-31-home-speed-and-stations]].

## [2026-10-31] ingest | Activity query and the pool across restarts
Tag sizes from one `findTags`, not `scene_count` per scene (cold Stats 0.5 → 0.05 s); the
Featured pool is snapshotted → [[featured-ranking]], [[caching]], [[2026-10-31-home-speed-and-stations]].

## [2026-10-31] decide | Scripts are the hands: use one first, write one when none fits
User rule: scriptable operations get a registered script; `scripts/manifest.json`,
`scripts.mjs` (list/search/show/lint), `check.mjs`, `deploy-check.mjs` → [[scripts-library]],
[[2026-10-31-scripts-library]]; [[run-checks]] and [[deploy-and-verify]] now name the scripts.
