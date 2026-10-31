---
title: Shared contract (@flix/shared)
kind: architecture
summary: packages/shared is the API contract between BFF and web plus the few values both need; the web never sees Stash shapes, and the package ships in the runtime image.
tags: [shared, types, contract, docker]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [packages/shared/src/index.ts, apps/server/src/imports.test.ts, Dockerfile]
related: [web-app, server-bff, featured-ranking, shared-package-missing-from-image]
---

# Shared contract (`@flix/shared`)

`packages/shared/src/index.ts` defines every shape the BFF returns and the web consumes:
`Ref`, `SceneCard`, `SceneFile`, `Playback`, `FeaturedWeights`, and so on. **The web app
knows only these types, never Stash's**, so the backend behind the BFF can be replaced piece
by piece ([[stash-layer]] is the only place that knows Stash).

## Values, not only types

The package also carries the few runtime values both sides need, today `FEATURED_DEFAULTS`
(the Featured dials' defaults, [[featured-ranking]]). Because the server imports a value from
it, the package's source must be in the production image: the Dockerfile copies
`packages/shared/src` into the runtime stage, and `apps/server/src/imports.test.ts` pins that
the server's import of `@flix/shared` resolves there. Before 2026-10-30 the image carried only
the server's source and the first Featured deploy crash-looped
([[shared-package-missing-from-image]]).

## Rules

- Add a field to the contract here first, then fill it in `stash.ts`, then read it in the web.
- Keep Stash-only concepts (its filter types, its ids' meaning) out of this package.
- A `workspace:*` dependency from both `apps/server` and `apps/web`.
