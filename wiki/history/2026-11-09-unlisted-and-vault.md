---
title: "2026-11-09: Unlisted and the Vault"
kind: history
summary: Generalised the Edu hold into an Unlisted level for videos, categories, performers and studios, listed in one Vault that replaces Edu, with a related-videos reason rule and a deploy check for the hold.
tags: [unlisted, home, recommendations]
status: record
date: 2026-11-09
verified: 2026-11-09
updated: 2026-11-09
related: [vault, unlisted-and-vault, 2026-11-09-edu-section, second-tags-exclusion-ignored]
---

# 2026-11-09: Unlisted and the Vault

## What changed

- `unlisted` table (migration `0008` copies the Edu categories in, `0009` drops `edu_tags`);
  `unlisted.ts` replaces `edu.ts`; the reserved Stash tag "Unlisted" for single videos.
- Exclusions merge Unlisted ids into the blocklist's criteria; `vault=1` (an OR, distributed
  over age buckets under 32); related videos by the all-reasons rule; affinity, More with, tile
  pictures and the StashDB shelf skip Unlisted.
- Web: `/vault` (and `/edu` redirect), Unlist on entity pages, the video page and card menus,
  Settings → Unlisted; station queue sends `noUnlisted`.
- `deploy-check.mjs`: the Edu check became the Unlisted check, adding a normal video's related list.

## How it was verified

- `node scripts/check.mjs`: 126 server tests, including the merged criteria, per-entity lifting,
  the Vault OR, its distribution over age buckets (≤ 32, no AND beside an OR) and the reason rule.
- Migrations applied from scratch to a throwaway dev database; the copy step moved an Edu row
  into `unlisted` as a category.
- `scripts/phone-flow.mjs` at 440×956 against production with the new endpoints stubbed: the
  Vault, a video page ("Unlisted ✓", "Unlisted through …"), a category page (Unlist), Settings,
  the `/edu` redirect; no overflow, header ends at 424 px.
- After deploy: `deploy-check.mjs` with "Educational" Unlisted (see the commit's deploy).

## Snags

- A read-only Stash probe run inside the production pod was refused by the session's permission
  rules, so the new filter shapes were kept to ones Stash already accepts and checked through
  flix's own endpoints after deploy.
- `drizzle-kit generate` asks interactively whether a new table renames an old one; generating
  the create and the drop as two migrations avoids the prompt.
