---
title: A deleted scene is never fetched again automatically; a Get by hand still fetches it
kind: decision
summary: Discovery and every other automatic path skip scenes deleted before (Whisparr's import exclusions, read fresh); a Get pressed by the user is respected, and cards mark such scenes "Deleted before".
tags: [whisparr, delete, discover, policy]
status: current
decided: 2026-11-02
by: user
verified: 2026-11-02
updated: 2026-11-02
related: [delete-via-whisparr, discover, stashdb-mirror, whisparr-nothing-monitored, whisparr-sync]
---

# A deleted scene is never fetched again automatically

**Decision (user, 2026-11-02):** what must be enforced is that flix never pulls a deleted scene
on its own. A click on Get is the user's intent and is respected, even for a scene deleted
before; the card says so instead of hiding the button.

## How it holds

- Every delete leaves the scene's StashDB id on Whisparr's import exclusion list
  ([[delete-via-whisparr]]), including a scene whose file was already gone (flix adds the
  exclusion itself, `POST /exclusions`).
- Discovery reads the exclusion list fresh on every run and stops if Whisparr does not answer,
  rather than reading "no answer" as "nothing excluded" (`discoverNew` in `getqueue.ts`).
- A delete drops the 1 h cache of the list that labels cards, so a card shows "Deleted before"
  at once.
- Whisparr itself adds nothing: every performer and studio is unmonitored
  ([[whisparr-nothing-monitored]]).

## What stays manual

- Cards on Discover, the shelves and the Home row carry a red "Deleted before" badge
  (`WantedScene.deletedBefore`) and keep their Get button.
- Discover's "All N" in Select leaves them out; tapping one still picks it.
- A scene fetched again keeps its exclusion, so a second delete asks for no second one.

_Until 2026-11-02 a deleted scene's card showed only "Deleted before" with no Get, and the
server-side cache could let discovery re-queue a scene deleted within the hour._
