---
title: The code is public on GitHub as BoomstickSoftware/stashtube; Forgejo stays the deploy remote
kind: decision
summary: On 2026-11-01 the user chose the name stashtube over flix for a public GitHub repo under the BoomstickSoftware org; Forgejo (origin) still owns the deploy, GitHub is a mirror pushed by hand after each push to origin.
tags: [github, repo, branding, deploy, public]
status: current
decided: 2026-11-01
by: user
verified: 2026-11-01
updated: 2026-11-02
related: [forgejo-ci, deploy-and-verify, one-commit-per-initiative, readme-screenshots]
---

# The code is public on GitHub as BoomstickSoftware/stashtube; Forgejo stays the deploy remote

**Decided** 2026-11-01 by the user. **Status** current.

## Context

The user wanted the project under the BoomstickSoftware GitHub org and asked for branding
options around the words flix, stash, vids and tube. GitHub crowding at the time: `flix` in
56k repo names, `tube` in 124k, `stash` is the backend's own name, `stashtube` in 1.

## Decision

- Repo: https://github.com/BoomstickSoftware/stashtube, **public**, topics stash, stashapp,
  tube, pwa, hono, react, typescript. Chosen over `flix` (the shipped name) and `stashflix`.
- The app, image, wiki and UI keep the name **flix** until a rename is decided; the README
  says so in its first lines.
- `origin` stays `git@git.lan:zbmowrey/flix.git`, because every push to it deploys
  ([[forgejo-ci]]). GitHub is the remote `github`, pushed by hand after a push to origin:
  `git push github main`. `main` tracks `origin/main`; `git push -u github` once moved the
  upstream to GitHub, which would have sent a bare `git push` away from the deploy, and was
  reverted.
- Before the first push the history was scanned: `gitleaks git` over all 108 commits found no
  leaks; the only private detail in the tree is LAN hostnames and a 192.168 address.

## Consequences

- [[deploy-and-verify]] gains a last step: push the mirror.
- The public repo carries a README that lets someone else run it from scratch, phone
  screenshots made with [[readme-screenshots]], `deploy/docker-compose.yml` and an **MIT**
  license (user's choice, 2026-11-01). The app keeps the name flix for now (user's choice,
  same day); a rename would be its own initiative.

## Library content stays out of git (2026-11-02)

When the Stash and Whisparr operations moved here from the nas repo, the user chose: notes that
name library content go in a **gitignored folder in this repo**, and such names are **scrubbed
from version control**.

- `private/` is gitignored. `private/wiki/<kind>/` holds wiki pages that name performers,
  studios, scenes, indexers or downloads (the Stash and Whisparr instance pages, their gotchas,
  runbooks and history). `scripts/wiki.mjs` loads them when present, indexes them into
  `private/wiki/index.md` (never `wiki/index.md`) and fails lint when a tracked page links one.
  `private/ops/` holds the Whisparr config snapshots and the browser filter.
- `scripts/privacy-check.mjs`, run by `check.mjs`, fails on any whole-word, case-sensitive match
  of a library name in a tracked or new file. Terms: `private/denylist.auto.txt` (every
  performer and studio name and alias in Stash, from flix's API: `privacy-check.mjs refresh`),
  `private/denylist.txt` (by hand: indexers, Whisparr's own performers and studios),
  minus `private/allowlist.txt`. A fresh clone without `private/` passes with a notice.
- The first scan (5,645 terms, 360 files) found 12 names already in tracked files (a test
  fixture path, two code comments, the 2026-10-31 UX audits, this wiki); all were replaced by
  placeholders. Older commits still hold them; rewriting published history is a separate step.
- `private/` is not backed up by git. It lives only on this Mac.
