---
title: Vite holds two copies of a package after a version change ("No QueryClient set")
kind: gotcha
summary: Changing a dependency's version while `pnpm dev` runs leaves Vite's pre-bundled deps with two copies of a package; React Query then throws "No QueryClient set", fixed by deduping it in vite.config.ts.
tags: [vite, web, dev, react-query]
symptom: "No QueryClient set, use QueryClientProvider to set one"
found: 2026-10-27
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/web/vite.config.ts]
related: [dev-setup, web-app]
---

# Vite holds two copies of a package after a version change ("No QueryClient set")

## Symptom

Every page fails with `No QueryClient set, use QueryClientProvider to set one` although
`main.tsx` wraps the app in a provider. Seen 2026-10-27 after a dependency bump while the dev
server was running.

## Cause

Vite pre-bundles dependencies once and keeps them under `node_modules/.vite`. After a
dependency's version changes while `pnpm dev` is running, the optimised bundle and the fresh
install can both be loaded, so the provider and the hook come from two copies of
`@tanstack/react-query` and the context does not match.

## Fix

`vite.config.ts` lists React Query under `resolve.dedupe`, so one copy is ever resolved.
Restarting Vite (or deleting `apps/web/node_modules/.vite`) clears the stale bundle.

## Avoid

Restart `pnpm dev` after any change to a `package.json` version. See [[dev-setup]].
