---
title: The runtime image lacked packages/shared and the pod crash-looped
kind: gotcha
summary: The first Featured deploy crash-looped because the server imported a value from @flix/shared and the runtime image lacked it; the Dockerfile now copies packages/shared/src and imports.test.ts pins it.
tags: [docker, deploy, incident, shared]
symptom: "pod CrashLoopBackOff right after a deploy; the server cannot resolve @flix/shared at startup"
found: 2026-10-30
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [Dockerfile, apps/server/src/imports.test.ts, packages/shared/src/index.ts]
related: [shared-contract, kubernetes-deployment, 2026-10-30-featured-ranking]
---

# The runtime image lacked packages/shared and the pod crash-looped

## Symptom

After the Featured deploy on 2026-10-30 the pod went into CrashLoopBackOff: Node could not
resolve `@flix/shared` at startup. The build stage had passed, because it installs the whole
workspace.

## Cause

The runtime stage copied only `apps/server/src` and `apps/server/drizzle`. `@flix/shared` had
been type-only in the server, so its absence never mattered; `featured.ts` was the first
server module to import a value (`FEATURED_DEFAULTS`) from it.

## Fix

Two attempts the same day: first the defaults were duplicated out of shared (678db44,
a0408f3), then reverted in favour of shipping the package: the Dockerfile copies
`packages/shared/src` into the runtime stage (b75ebd3), so the defaults have one home.
`imports.test.ts` pins that the shared package resolves at runtime.

## Avoid

Anything the server imports at runtime must be copied into the runtime stage of the
Dockerfile. `docker build -t flix .` locally exercises the same stages ([[run-checks]]).
See [[shared-contract]].
