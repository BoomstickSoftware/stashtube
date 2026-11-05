---
title: A scene with its StashDB id set stays untitled after Identify
kind: gotcha
summary: Stash's Identify matches a stash-box by fingerprint only, so a linked scene whose phash StashDB does not know keeps no title, studio or cover; scrape it by id and write the fields instead.
tags: [stash, stashdb, identify, library]
symptom: "scene has a stash_id but no title, studio or cover after metadataIdentify"
found: 2026-11-04
status: current
verified: 2026-11-04
updated: 2026-11-04
code: [scripts/library-reconcile.mjs]
related: [library-reconcile, stash-layer]
---

# A scene with its StashDB id set stays untitled after Identify

## Symptom

After `sceneUpdate(stash_ids:[…])` with the uuid from the Whisparr folder name and one
`metadataIdentify(sceneIDs, StashDB source)`, the job finishes and most scenes are exactly as
before: title empty, no studio, no performers, the placeholder cover. In the same run the few
scenes that were just scanned came out complete.

## Cause

Identify asks the stash-box for scenes matching the file's fingerprints (phash, oshash, md5).
It never queries by the `stash_id` already on the scene. A file whose fingerprint StashDB has
not recorded (a re-encode, a self-published channel, a pack) matches nothing, so Identify has
nothing to merge. The 2026-10-29 run that seemed to prove the opposite (363 linked, then
identified) had files with known fingerprints.

## Fix

`scrapeSingleScene(source:{stash_box_endpoint}, input:{query:"<uuid>"})` returns the scene by
id with `stored_id`s for the studio, performers and tags Stash already holds; write the rest
with `sceneUpdate` and create what is missing. `scripts/library-reconcile.mjs --fill` does
this for every linked scene that is still bare ([[library-reconcile]]).

## Avoid

After linking ids, run Identify once for the fingerprint matches, then `--fill` for the rest;
do not re-run Identify hoping for a different answer. The report's "still bare" list is the
check.
