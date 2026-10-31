---
title: Request guard
kind: architecture
summary: What keeps other web pages away from flix without a login — cross-site writes refused, foreign host names (DNS rebinding) refused, no framing, no sniffing, no referrer — and what is always let through.
tags: [security, server, csrf, headers]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [apps/server/src/guard.ts, apps/server/src/guard.test.ts, apps/server/src/index.ts]
related: [lan-only-no-ingress, single-user-no-login, optional-login, media-proxy, kubernetes-deployment]
---

# Request guard

flix has no login in production ([[single-user-no-login]], [[optional-login]]) and is LAN-only
([[lan-only-no-ingress]]), so the threat is a web page open in a browser on the LAN making that
browser talk to flix. `guard.ts` answers it; `index.ts` mounts it before every route.

## Rules

- **Cross-site writes refused (403)**: a POST, PUT, PATCH or DELETE under `/api` or `/media`
  whose `Sec-Fetch-Site` is not `same-origin`/`none`, or (older browsers) whose `Origin` host is
  not the request's `Host`. Before this, `fetch(…, { mode: 'no-cors', body })` from any site
  could call `/api/scenes/delete` (Hono's `c.req.json()` ignores Content-Type). Tools without
  those headers (curl, the check scripts) are let through: no web page can make such a request.
- **Foreign host names refused (421)**: only a Host that is an IP, `localhost`, a single label
  or a local-only suffix (`.lan`, `.local`, `.localdomain`, `.internal`, `.home.arpa`, `.svc`,
  `.cluster.local`) is served, so a public domain re-pointed at the LAN IP (DNS rebinding)
  cannot become same-origin with flix. `/healthz` and `/readyz` answer any Host (probes, the
  deploy's smoke test by IP).
- **Headers on every response**: `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  no-referrer` (the StashDB covers are hotlinked; no flix URL leaks to that CDN),
  `X-Frame-Options: DENY` and `frame-ancestors 'none'` (no click-jacking a Delete).
- **Playback CORS** echoes the asking origin only when it is local (`playbackOrigin`), for
  hls.js on `flix.lan` reading from `MEDIA_ORIGIN` ([[media-proxy]]); it was `*`.

## Verified

2026-10-31 in production: the app's own POST answers 200, a cross-site POST 403, `Host:
flix.attacker.example` 421, the headers present. `guard.test.ts` pins the host list and the
write rule.

## Avoid

A new state-changing route needs nothing extra: the guard covers every method but GET, HEAD and
OPTIONS. Do not add a GET that changes state; it would pass the guard.
