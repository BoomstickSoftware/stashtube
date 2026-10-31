---
title: flix is LAN-only, with no Ingress and no public host
kind: decision
summary: flix is reached at a MetalLB address or a hosts-file name, never through the Cloudflare tunnel; remote use would be a Tailscale subnet route or, later, an identity-aware proxy.
tags: [network, security, k8s]
status: current
decided: 2026-10-26
by: user
verified: 2026-10-30
updated: 2026-10-30
related: [kubernetes-deployment, single-user-no-login, optional-login, pin-lock]
sources: [k8s:docs/flix.md]
---

# flix is LAN-only, with no Ingress and no public host

**Decided** 2026-10-26 by the user. **Status** current.

## Context

Other cluster apps get a `*.zbmowrey.com` host through the Cloudflare tunnel. flix serves an
adult library with no login ([[single-user-no-login]]).

## Decision

A MetalLB Service at 192.168.1.152 on port 80 and nothing else: no Ingress, no public host,
nothing reachable from outside the LAN ([[kubernetes-deployment]]). `flix.lan` exists only in
hosts files (the router answers `.lan` with SERVFAIL). Remote access, if wanted, is a Tailscale
subnet route.

## Consequences

- flix is plain http, which is why the PIN hash is plain JS ([[pin-lock]]) and session cookies
  would not be `secure` ([[optional-login]]).
- Playback links use the IP (`MEDIA_ORIGIN`) because AirPlay receivers cannot resolve
  hosts-file names.
- A hosted endpoint behind strong auth (Cloudflare Access, Tailscale Funnel with an identity
  provider) is a "later" item ([[roadmap]]), never the app password alone.

## Revisit if

The user wants flix off the LAN.
