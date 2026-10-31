---
title: getRouteApi pages need explicit return types, and navigate reducers a cast
kind: gotcha
summary: A page component using getRouteApi without a `: JSX.Element` return type makes the router's types circular, and a `navigate({ to: '.' })` reducer sees the union of every route's search, so `prev` must be cast.
tags: [tanstack-router, typescript, web]
symptom: "typecheck fails with a circular / self-referencing type error on a page that uses getRouteApi (exact code not recorded)"
found: 2026-10-29 # inferred from the fixing commit
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/web/src/pages, apps/web/src/routes]
related: [coding-conventions, web-app]
---

# getRouteApi pages need explicit return types, and navigate reducers a cast

## Symptom

Typecheck fails with circular-reference errors in `routeTree.gen.ts` or the page, or a
`navigate` search reducer refuses a patch that is valid for the current route.

## Cause

TanStack Router infers each route's component type from the route tree, and the component
infers from `getRouteApi(...)`, which refers back to the tree. Without an annotation the
loop has no anchor. Separately, `navigate({ to: '.' })` is typed over every route, so the
reducer's `prev` is the union of all search schemas.

## Fix

- Page components that call `getRouteApi` declare `: JSX.Element`.
- Reducers cast the previous value: `(prev) => ({ ...(prev as SceneQuery), ...patch })`.
  Still the case in `StationEditor` (see [[roadmap]], known gaps).

## Avoid

Both rules are in [[coding-conventions]]. Routes themselves are typed since the move to
file-based routing ([[web-app]]).
