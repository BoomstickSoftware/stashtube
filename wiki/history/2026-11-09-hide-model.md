---
title: One hide model (Not interested deletes, Block stops downloads)
kind: history
summary: Initiative D of the strategy review: Not interested opens the delete, Block left the library lists and covers only downloads, and Settings got one Hidden section.
tags: [blocklist, unlisted, delete, settings, ui]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [hide-means-delete-block-or-unlist, blocklist-and-exclusions, vault, cleanup-page, settings-page, roadmap]
---

# One hide model

Built from decision [[hide-means-delete-block-or-unlist]] (initiative D of [[roadmap]]).

## What changed

- `exclusions()` no longer carries the blocklist or the Not interested tag: owned videos of a
  blocked performer, studio or category show everywhere again ([[blocklist-and-exclusions]]).
- The not-downloaded shelf on Home now drops blocked performers, studios and categories too (it
  only dropped Unlisted ones; `dropUnlistedWanted` became `dropHiddenWanted`). The daily
  discovery of new releases also skips blocked categories (it skipped performers and studios).
- Block and Unlist are independent: the API no longer clears one when the other is set.
- Card menu: "Not interested: delete…" opens the delete dialog on every device; the separate
  desktop "Delete…" and the tag toggle are gone. The scene page's Not interested button is gone;
  its Delete stays.
- Settings → Library: one **Hidden** section (search with Unlist and Block per hit; Unlisted and
  "Blocked from downloading" lists) replaced Unlisted, Blocklist and Not interested. The Vault's
  Manage links to `#hidden`. Cast mixes offer Normal / Unlisted only.
- Cleanup lists videos still tagged Not interested (Delete all, Keep). None existed.
- Filters: "Show blocked" became "Ignore my performer defaults".

## The Cast: M block

Asked when building: the user had no men-only videos left (the one `Cast: M` video was a
StashDB error, fixed by a hand cast override), so the block was left; it now does nothing and
shows under "Blocked from downloading", and picking either Cast choice clears it.

## Verified

`node scripts/check.mjs` (144 tests); phone screenshots of Settings → Hidden (with search
results), the card menu sheet and Cleanup against production data.

## Not done

The Hidden section stays in Settings until the navigation rework ([[five-tab-navigation]]).
