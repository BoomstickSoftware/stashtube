---
title: Reel review and listing
kind: feature
summary: A finished reel build waits for the user's approval; approving files it under performers, categories and studios and lists it on their pages and in search, with its own rating, resume point and plays.
tags: [reels, review, search, browse, resume]
status: current
verified: 2026-11-11
updated: 2026-11-11
routes: [/reel/$id, /reels, /]
api: [GET /api/reels?q=&performer=&tag=&studio=&state=, GET /api/reels/:id/proposal, POST /api/reels/:id/approve, POST /api/reels/:id/send-back, PUT /api/reels/:id/activity, PUT /api/reels/:id/rating, GET /api/search]
code: [packages/shared/src/reels.ts, apps/server/src/reels.ts, apps/server/src/routes/reels.ts, apps/web/src/pages/Reels.tsx, apps/web/src/components/ReelShelf.tsx, apps/web/src/components/SearchBox.tsx]
related: [reels, reel-builds, reels-edit-by-reference, private-session, search, data-model]
---

# Reel review and listing

Milestone 4 of [[reels-engineering-roadmap]]; behind `FLIX_REELS=1`. Building: [[reel-builds]].

## States

`reelState(latest build, approved build)` in `packages/shared/src/reels.ts`:

| State | Meaning |
|---|---|
| draft | never built |
| queued, building, failed | its latest build |
| review | the latest build is finished and is not the approved one |
| published | the latest finished build is the approved one |

A published reel that is edited and rebuilt goes to review again while **its approved file
keeps playing**: `finishBuild` keeps the approved build's row, and approving the new one drops
the old (the builder then deletes its file).

## Review

Home shows a "Reels ready for review" shelf. The reel's page shows the built file, a title
field, and what to file it under, offered from the videos its clips come from
(`proposeDetails`): each performer, studio and category with the share of the reel's running
time it appears in. Performers and studios start ticked; a category starts ticked when it
covers at least half of the reel (`TAG_SHARE`). **Approve** saves the ticked ones (Stash ids
with their names, table `reel_refs`) and publishes; **Send back** drops the build and the reel
is a draft again, or stays published with its earlier file. Re-reviewing a published reel
starts from what it is filed under now.

## Listed like a video, kept apart

Reels are not Stash scenes ([[reels-edit-by-reference]]), so they are not in the video grids:

- **Its own page**: the approved file on top with the browser's controls (AirPlay,
  fullscreen), stars, length, size and views, and its performers, studios and categories as
  links; the editor below.
- **Shelves**: "Reels" on a performer's, a category's and a studio's page, when a published
  reel is filed there (`GET /api/reels?performer=…&state=published`).
- **Search**: the typeahead lists published reels whose name, or the name of anything they are
  filed under, contains the term (`SearchResult.reels`, up to 6). Opening one is not saved as a
  recent search.
- **Browse → Reels**: every reel with its state.

## What is recorded

On `reels`, since Stash cannot hold it: `rating`, `resume_sec`, `play_count`,
`last_played_at`. The page saves the position every 15 s of movement and on pause, clears it
past 95% and at the end, and counts a play after 20 s actually played (`COUNT_PLAY_AFTER`).
**Nothing is sent in a private session**: the automatic writes check `isPrivate()`, the rating
goes through `guardWrite()` ([[private-session]]). Playing the file during review records
nothing. Approving a new file resets the resume point; the rating stays.

## Verified, and not

Approve, the filters, send back, activity and rating ran against the dev database; the review
and published screens were rendered at phone size with stubbed data. Not run: the proposal
against Stash, and anything in production (the switch is off).
