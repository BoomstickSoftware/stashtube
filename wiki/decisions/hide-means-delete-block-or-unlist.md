---
title: Not interested deletes, Block stops downloads, Unlist keeps it off the common views
kind: decision
summary: Not interested opens the delete, Block only stops downloads, and Unlist keeps owned videos off Home and recommendations but on demand.
tags: [blocklist, unlisted, delete, ui]
status: current
decided: 2026-11-09
by: user
verified: 2026-11-09
updated: 2026-11-09
related: [blocklist-and-exclusions, vault, delete-via-whisparr, discover, whisparr-shelf, unlisted-and-vault, 2026-11-09-strategy-review]
---

# Not interested deletes, Block stops downloads, Unlist keeps it off the common views

**Decided** 2026-11-09 by the user (strategy review). **Status** current; not built yet
(initiative D of [[roadmap]]). Until it ships, [[blocklist-and-exclusions]] describes the code.

## Context

Three marks did overlapping things under three names in three places: Block (Settings and entity
pages, hidden from every list), Not interested (a Stash tag, hidden from every list, undone in
Settings) and Unlist (off Home and recommendations, listed in the [[vault]]). flix has one user,
so "not interested" has no audience to tune for.

## Decision

- **Not interested = delete it.** The action opens the delete dialog ([[delete-via-whisparr]])
  rather than tagging; there is no "hidden but kept" state for it.
- **Block = never download it again.** A blocked performer, studio or category is kept out of
  Discover, the not-downloaded shelf and Home row, and Get. Videos **already in the library show
  as normal**; to keep those out of sight, Unlist them.
- **Unlist = keep, but only on demand.** Unchanged: off Home, Featured, For you, stations and
  unrelated recommendations; still in Browse and search; listed in the Vault ([[vault]]).

## Consequences

- `withExclusions` stops applying blocks to library queries; [[blocklist-and-exclusions]],
  CLAUDE.md rule 4 and [[playlists-ignore-blocklist]] are rewritten when it ships.
- The `Cast: M` block the Cast sync set up ([[cast]]) then stops hiding owned videos; it should
  become an Unlist if they are still to stay out of sight (ask when building).
- Videos already tagged "Not interested" in Stash are listed once in Cleanup for deletion,
  then the tag is retired.
- The Settings sections for the blocklist and "Not interested" move into one Hidden view with
  the Vault ([[five-tab-navigation]]).

## Revisit if

Owned videos of a blocked performer keep turning up where they are not wanted often enough that
Unlisting them by hand is a chore (then Block could imply Unlist).
