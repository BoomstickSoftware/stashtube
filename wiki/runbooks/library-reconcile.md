---
title: Reconcile the library (disk, Stash, Whisparr)
kind: runbook
summary: One script, run inside the flix pod, lists every difference between the files on disk, Stash and Whisparr and can scan, link and identify what Stash is missing.
tags: [stash, whisparr, library, operations, scripts]
status: current
verified: 2026-11-04
updated: 2026-11-04
code: [scripts/library-reconcile.mjs]
related: [stash-and-whisparr-clients, scripts-library, nfs-media, stash-layer, whisparr-nothing-monitored, identify-leaves-linked-scene-bare]
---

# Reconcile the library (disk, Stash, Whisparr)

Use when files were added or imported and something looks untitled, uncovered or absent: the
three inventories should be one set. The flix pod has the keys and the read-only NFS mount of
the library, so the script runs there and the Mac needs no `.env`
(`scripts/library-reconcile.mjs`, [[scripts-library]]).

## Steps

```sh
# 1. the report (read-only): a line per difference
kubectl -n flix exec -i deploy/flix -- node - < scripts/library-reconcile.mjs
```

Expected: `disk N videos | Stash N scenes | Whisparr … with a file` with the same N, every
list at 0 but "Whisparr records without a file" (the Get queue's scenes still downloading) and
"StashDB id differs" (StashDB duplicates and Whisparr mismatches, left alone on purpose).

```sh
# 2. files on disk Stash never scanned: queue the scan (sprites and phashes for a 2160p file take minutes)
kubectl -n flix exec -i deploy/flix -- node - --scan < scripts/library-reconcile.mjs
scripts/stash.py jobs --wait                      # or the jobQueue query

# 3. scenes with no StashDB id whose Whisparr folder carries one: set the id, then one Identify
kubectl -n flix exec -i deploy/flix -- node - --link < scripts/library-reconcile.mjs
```

Identify matches StashDB by fingerprint only: a scene whose phash StashDB knows gets title,
date, studio, performers, tags and cover; one it does not know stays bare even with the id set
(_2026-11-04: 3 of 104 identified, 101 stayed bare_, [[identify-leaves-linked-scene-bare]]).
Run step 3 again after step 2's scan, for the newly scanned scenes, then:

```sh
# 4. linked scenes Identify left bare: scrape each by its StashDB id and write the fields,
#    creating the studios, performers and tags Stash lacks (about 2 s per scene)
kubectl -n flix exec -i deploy/flix -- node - --fill < scripts/library-reconcile.mjs
```

- A file Whisparr does not track is a feature film (Whisparr matches films by TMDB, and the
  Get path never created it): `GET movie/lookup?term=<title>`, pick the entry by year, studio
  and runtime, `POST movie` with it plus `monitored:false`, `qualityProfileId`, `rootFolderPath`
  and `path` = the folder the file is already in, then `RescanMovie` picks the file up
  (`hasFile` true, no move). Backup first, as every Whisparr write
  ([[stash-and-whisparr-clients]]).
- A scene with no id anywhere: scrape by text instead of by id
  (`private/wiki/runbooks/whisparr-import-into-chosen-scene.md`, step 5).
- Specific runs, with names and numbers: `private/wiki/history/`.

## If it fails

- `MEDIA_PATH_MAP is not set`: the script is not running in the pod (or the env lacks the
  map); use the `kubectl exec -i` form above.
- A very slow first `find`: the NFS walk of ~2,700 files takes about 6 s in the pod; fine.
- Stash answers `database is locked` while a scan writes: wait for the queue and rerun.
