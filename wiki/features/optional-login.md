---
title: Optional password login
kind: feature
summary: The single-password login that FLIX_PASSWORD turns on, its cookie, rate limits and signed playback links, and why it is off in production.
tags: [auth, login, security, config]
status: current
verified: 2026-10-30
updated: 2026-10-30
api: [GET /api/session, POST /api/login, POST /api/logout]
code: [apps/server/src/auth.ts, apps/server/src/signing.ts, apps/web/src/pages/Login.tsx]
related: [single-user-no-login, lan-only-no-ingress, config-env, forgejo-ci, pin-lock]
---

# Optional password login

With `FLIX_PASSWORD` unset every request passes and the app is only as private as its network.
That is the production setting ([[single-user-no-login]], [[lan-only-no-ingress]]).

## When it is set

- `FLIX_SESSION_SECRET` is required too; `config.ts` refuses to start without it.
- `POST /api/login` compares in constant time and sets a signed, httpOnly, SameSite=Lax cookie
  `flix_session` for 30 days, `secure` when the request came over HTTPS (`X-Forwarded-Proto`
  or the URL). `GET /api/session` reports `required` and `authenticated`.
- **Rate limit**: at most 5 failed logins per client and 20 overall per 15 minutes (the client
  is `CF-Connecting-IP`, then `X-Forwarded-For`); a limited client gets 429. Successful logins
  do not count.
- **Signed playback links** stand in for the session on that scene's video only (`?st=`,
  `signing.ts`), so AirPlay receivers can fetch without the cookie.
- The deploy smoke test reports 401 on `/api/*` as "lock" rather than failing
  ([[forgejo-ci]]).

The [[pin-lock]] is unrelated: a browser-side privacy screen, not authentication.
