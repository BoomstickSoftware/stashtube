---
title: NFS media mount
kind: integration
summary: flix reads the original video files read-only over NFS from the NAS export of /volume1/Media/adult, mapped onto Stash's paths with MEDIA_PATH_MAP; Whisparr is the only writer.
tags: [nfs, nas, media, storage]
status: current
verified: 2026-10-30
updated: 2026-10-30
sources: [nas:docs/network.md, k8s:docs/flix.md, k8s:infra/flix/storage.yaml]
related: [media-proxy, kubernetes-deployment, stash-library, delete-via-whisparr]
---

# NFS media mount

## The export (NAS side, owned by `~/code/nas`)

`/volume1/Media/adult` is exported to the k8s workers 192.168.1.134–.136 **read-only**
(`ro,async,root_squash,subtree_check,secure`), added 2026-10-26 by hand. ADM firmware updates
wipe `/volume0/etc/exports`, so the k8s repo's `infra/nas/ensure-exports.sh` self-heals it
within 5 minutes. Check from the Mac:

```sh
ssh dtr 'showmount -e localhost | grep adult'   # expect the three worker addresses
```

## The mount (cluster side, owned by `~/code/k8s`)

PV `flix-media` (NFS `192.168.0.10:/volume1/Media/adult`, `nfsvers=4.2,hard,ro`,
ReadOnlyMany, 10Ti nominal) and PVC `flix-media` in namespace `flix`, mounted at `/media/adult`
in the pod. The image runs as uid 1000 and the files are world-readable.

## How flix uses it

`MEDIA_PATH_MAP=/data/adult=/media/adult` turns the path Stash reports into the local one, so
`/media/play/:id` serves the original by byte range without going through Stash
([[media-proxy]]). When the map does not resolve a file, flix streams it through Stash instead.

## Who writes

Nobody here. Whisparr owns the files; Stash and flix mount them read-only, so deleting a video
goes through Whisparr ([[delete-via-whisparr]]) and new files arrive through Whisparr imports
([[stash-library]]).

## If videos stop playing but pages load

Check the export first (command above); then `kubectl -n flix exec deploy/flix -- ls /media/adult`.
Stash being down leaves cached pages, images and direct-play working; transcodes and fresh
queries fail until it is back.
