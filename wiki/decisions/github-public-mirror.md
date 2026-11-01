---
title: The code is public on GitHub as BoomstickSoftware/stashtube; Forgejo stays the deploy remote
kind: decision
summary: On 2026-11-01 the user chose the name stashtube over flix for a public GitHub repo under the BoomstickSoftware org; Forgejo (origin) still owns the deploy, GitHub is a mirror pushed by hand after each push to origin.
tags: [github, repo, branding, deploy, public]
status: current
decided: 2026-11-01
by: user
verified: 2026-11-01
updated: 2026-11-01
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
