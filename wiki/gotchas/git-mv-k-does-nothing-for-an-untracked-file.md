---
title: "git mv -k silently does nothing for an untracked file"
kind: gotcha
summary: git mv -k skips a file git does not track and still exits 0, so a fallback after "||" never runs and a following delete of the old folder loses the file.
tags: [git, shell]
symptom: "a file moved with git mv -k is gone from both the old and the new place"
status: current
verified: 2026-11-11
updated: 2026-11-11
related: [build-a-feature-on-a-branch]
---

# `git mv -k` silently does nothing for an untracked file

**Symptom**: after `git mv -k old/file new/file 2>/dev/null || mv old/file new/file; rm -rf old`
the file is gone from both places.

**Cause**: `-k` means "skip what would be an error". An untracked source is such an error, so
git moves nothing and exits 0; the `|| mv` fallback never runs. Seen twice: a wiki page rename
that did not happen (2026-11-10) and the reel builder, deleted with its old folder and
rewritten from the session (2026-11-11).

**Do instead**: for a file that may be untracked, plain `mv` and then `git add -A`; never
delete the old location in the same command, check the new one exists first.
