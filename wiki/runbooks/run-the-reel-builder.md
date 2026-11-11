---
title: Run the reel builder on the NAS
kind: runbook
summary: Copy the builder's code to the NAS, try one build by hand, add the container to the flotilla stack, and what to look at when a build does not start or fails.
tags: [reels, nas, flotilla, deploy]
status: current
verified: 2026-11-11
updated: 2026-11-11
related: [reel-builds, reels-engineering-roadmap, scripts-library]
---

# Run the reel builder on the NAS

What it is and why: [[reel-builds]]. Steps 1 and 2 were done on 2026-11-11 (step 2 by the
user, against a flix on the dev database); step 3 is not.

## 1. Copy the code (done 2026-11-11)

```sh
node scripts/reel-builder.mjs deploy
```

Copies `apps/server/src/reelBuilder.ts` and the two shared files it imports to
`/volume1/Flotilla/.flotilla/reel-builder/app` (repo paths kept) and makes
`/volume1/Media/adult/reels/.work`. Run it again after any change to those three files, then
restart the container.

## 2. One build by hand

```sh
node scripts/reel-builder.mjs once http://192.168.1.152
```

A throwaway `alpine:3.24` container (the image is already on the NAS) that installs Node,
ffmpeg and Intel's VAAPI driver, asks flix once, builds at most one reel and exits. Queue a
reel with **Build now** first, or it answers nothing to do. It prints ids and timings.

## 3. The container in the flotilla stack

The flotilla repo owns the compose file; this is the service to add there (it deploys through
Portainer from GitHub). The command is the `START` constant in `scripts/reel-builder.mjs`.

```yaml
  reel-builder:
    image: alpine:3.24
    container_name: reel-builder
    restart: unless-stopped
    devices:
      - /dev/dri:/dev/dri
    environment:
      FLIX_URL: http://192.168.1.152   # flix by IP: the container has no hosts entry
      REELS_DIR: /reels
    volumes:
      - /volume1/Flotilla/.flotilla/reel-builder/app:/app:ro
      - /volume1/Media/adult:/data/adult:ro
      - /volume1/Media/adult/reels:/reels
    command:
      - sh
      - -c
      - apk add --no-cache --quiet nodejs ffmpeg intel-media-driver >/dev/null 2>&1; command -v node >/dev/null && command -v ffmpeg >/dev/null || { echo "node or ffmpeg did not install"; exit 1; }; exec node /app/apps/server/src/reelBuilder.ts
```

The library mount must be at `/data/adult`: the plan carries paths as Stash names them.

apk's exit status is ignored on purpose: in an `alpine:3.24` container on this NAS its
post-install triggers end with "killed by signal 9" and apk reports failure, although the
packages are installed (first run by hand, 2026-11-11; the cause is not known). The command
checks that `node` and `ffmpeg` exist instead.

## Looking at it

```sh
node scripts/reel-builder.mjs status     # the container, its last lines, built files, .work size
```

| Symptom | Look at |
|---|---|
| "Queued" never starts with Build now | is the container up (`status`)? does it reach flix (`waiting: …` lines)? is `FLIX_REELS=1` set on the flix deployment (the claim route answers 404 without it)? |
| Queued for tonight did not build | the window is 02:00 to 05:00 Eastern and needs 5 minutes since the last build ended |
| "The build failed" with an ffmpeg line | the reel's page shows ffmpeg's last complaint, paths removed; `VAAPI` or `Device creation failed` means `/dev/dri` or the driver is missing in the container |
| "a source file is not where flix says it is" | the library mount is not at `/data/adult`, or the video was moved since the reel was queued: queue it again |
| Build stuck on "Building" | the builder stopped; after 10 silent minutes flix queues it again |
