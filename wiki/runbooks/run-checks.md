---
title: Run the checks
kind: runbook
summary: The four checks every change passes before a commit (typecheck, lint, tests, image build), what the tests cover, and the fact that the image build runs typecheck and tests too.
tags: [tests, lint, typecheck, docker, ci]
status: current
verified: 2026-11-10
updated: 2026-11-10
code: [scripts/check.mjs, package.json, apps/server/package.json, apps/web/package.json, Dockerfile]
related: [coding-conventions, mobile-checks, one-commit-per-initiative, server-bff, scripts-library]
---

# Run the checks

Before every commit ([[one-commit-per-initiative]]); UI changes also get [[mobile-checks]].

## Before every push

`.githooks/pre-push` runs `node scripts/check.mjs`, so a push that would deploy a failing build
or publish a library name stops (the privacy check cannot run in CI: its deny-list is not in
git). A fresh clone needs `git config core.hooksPath .githooks` once. `git push --no-verify`
skips it.

## Steps

One script runs them in order and stops at the first failure ([[scripts-library]]):

```sh
node scripts/check.mjs             # typecheck, web tsc, lint against the warning baseline, tests
node scripts/check.mjs --docker    # plus the image build
```

Expected: `ok` per check, `5 warnings (baseline 5)` for lint, `pass N / fail 0` for the tests
(80 on 2026-10-31), then `all checks passed`. The baseline lives in `check.mjs`
(`LINT_WARNINGS_BASELINE`); lower it when a known warning goes away, never raise it. oxlint
prints no summary line outside a terminal, so the script counts the `warning` lines.

The checks it runs, for doing one by hand:

```sh
pnpm typecheck                     # tsc in server and shared only (web has no typecheck script)
(cd apps/web && npx tsc -b)        # the web's tsc; otherwise only the image build runs it
pnpm --filter @flix/web lint       # oxlint; 5 React-compiler warnings are known, add none
pnpm test                          # node:test suites in apps/server
docker build -t flix .             # what CI builds; runs typecheck + tests + web build inside
```

Expected: no errors from typecheck and the web's tsc, no new lint warnings, `pass N / fail 0` from the tests (69 on
2026-10-30, 80 on 2026-10-31), and a successful image.

## What the tests cover

`node --test --import ./test-env.ts 'src/**/*.test.ts'` in `apps/server`; `test-env.ts`
supplies the env `config.ts` needs; nothing reaches Stash or Postgres. The suites pin the pure
parts where a mistake would only show as a Stash 500 or a silent miss:

| Suite | Pins |
|---|---|
| `stash.test.ts` | the filter builder's nesting rules |
| `finders.test.ts` | every criterion key each finder sends, against the introspected filter schemas ([[stash-filters-have-no-id-criterion]]) |
| `cache/memory.test.ts`, `cache/assets.test.ts` | TTL, stale-while-refresh, LRU, ETag behaviour |
| `files.test.ts` | byte ranges |
| `signing.test.ts` | signed playback links |
| `featured.test.ts` | rank normalisation, weights, per-performer/studio caps |
| `duplicates.test.ts` | which copy to keep |
| `previews.test.ts` | per-station seed and bounded fan-out |
| `markers.test.ts` | marker grouping on the seek bar |
| `whisparr.test.ts`, `stashdb.test.ts` | the exact outgoing requests; both writes refuse anything but one scene id |
| `imports.test.ts` | the server's `@flix/shared` import resolves to the shipped package ([[shared-package-missing-from-image]]) |

There are no web tests; the web is checked by lint, typecheck and the headless scripts.

## If it fails

- A typecheck error in a filter input: the criterion does not exist in Stash's schema; do not
  cast it away ([[stash-layer]]).
- `imports.test.ts` fails: a new value import from a package the Dockerfile does not copy.
- `docker build` fails on `pnpm install --frozen-lockfile`: run `pnpm install` and commit the lockfile.
