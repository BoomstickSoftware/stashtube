---
title: Web error wording
kind: architecture
summary: How the web app turns a failed read or write into words a person can act on (describeError), what each kind of error shows, and why the client's timeout is 65 s.
tags: [web, ux, stash]
status: current
verified: 2026-10-31
updated: 2026-11-10
code: [apps/web/src/lib/api/client.ts, apps/web/src/components/ui.tsx, apps/web/src/components/ErrorBoundary.tsx]
related: [web-app, failed-writes-toast-only, ui-system]
---

# Web error wording

_Split from [[web-app]] on 2026-11-10._ A render error (not a failed request) is caught by the
error boundaries described in [[web-app]].

`describeError(error, 'read' | 'write')` in `lib/api/client.ts` is the one place an error
becomes words, used by `ErrorBox` (`ui.tsx`) and the failed-write toast (since 2026-10-31,
[[failed-writes-toast-only]]):

| Error | Shown |
|---|---|
| `ApiError` 502 whose message starts `Stash:` (the server's `StashError` handler) | "Stash is busy or down (a scan locks it for a few minutes). Cached pages still work." (writes: "… Nothing was saved; try again later."), the raw message in a smaller line under it ([[stash-database-locked]]) |
| `TypeError` from `fetch` ("Failed to fetch", Safari's "Load failed") or an `AbortError` | "No connection to flix. Check Wi-Fi, then try again." |
| `TimeoutError` (the client's own abort) | "flix took more than 65 s to answer. Try again in a moment." |
| any other `ApiError` (401 included; the login sheet opens from the `flix:login-required` event the client raises) | its message |

The client aborts a request after **65 s** (`TIMEOUT`; _45 s until 2026-10-31_), longer than
the server's 60 s Stash budget, so a slow Stash reaches the page as the server's "Stash: no
answer in 60 s" 502 and gets the Stash wording rather than a bare timeout.
