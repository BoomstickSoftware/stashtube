---
title: Coding conventions
kind: architecture
summary: The TypeScript and React rules the code must follow (erasable TS, typed routes, the storage helper, no useEffect return values, the grid pin) and why each exists.
tags: [typescript, react, conventions, lint]
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/server/tsconfig.json, apps/web/src/lib/storage.ts, apps/web/src/components/ui.tsx]
related: [server-bff, web-app, run-checks, one-commit-per-initiative]
---

# Coding conventions

## Server

- **Erasable TypeScript only** (`erasableSyntaxOnly`), because Node 26 strips types without
  compiling: no enums, namespaces or parameter properties; relative imports end in `.ts`;
  type-only imports use `import type`.
- Routes are zod-validated in `api.ts`; Stash shapes stay inside `stash.ts` ([[stash-layer]]).
- A value import from `@flix/shared` is allowed (the package ships in the image), and
  `imports.test.ts` pins it ([[shared-contract]]).
- Tests are `node:test` beside the code; nothing in them reaches Stash or Postgres.

## Web

- **Browser-side preferences go through `lib/storage.ts`** (`useStored`, `readStored`,
  `writeStored`): localStorage can be missing or throw (private mode, blocked site data) and
  the helper is the one place that handles it. On/off settings render with `Switch` from
  `components/ui.tsx`.
- Page components that use `getRouteApi` declare `: JSX.Element` return types; a
  `navigate({ to: '.' })` reducer casts `prev` ([[route-api-circular-types]]).
- `useEffect` callbacks must not return a value ([[useeffect-return-value-crash]]).
- Page grids pin their mobile column with `grid-cols-1` = `minmax(0,1fr)`
  ([[grid-column-overflow]]).
- Settings live next to the page they affect, not on the Settings page, unless they are
  global ([[settings-next-to-page]]).
- Touch and hover rules: [[mobile-first-ui]]. A new write that records what was watched must go
  through `guardWrite()` or check `isPrivate()` ([[private-session]]).
- Lint is oxlint (`pnpm --filter @flix/web lint`); 5 React-compiler warnings are known, add none ([[run-checks]]).

## Both

- One `describeQuery` (`lib/describe.ts`) renders a filter set everywhere; one storage helper;
  one `Switch`; one `SeekBar` for both players. Prefer extending the shared piece to adding a
  second.
- Verify with `pnpm typecheck`, lint, `pnpm test`, and a headless screenshot where UI changed
  ([[run-checks]], [[mobile-checks]]); then one commit per initiative
  ([[one-commit-per-initiative]]).
