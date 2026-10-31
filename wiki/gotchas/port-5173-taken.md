---
title: Port 5173 on this Mac belongs to another project's container
kind: gotcha
summary: Vite's default port 5173 is held by the OrbStack container `mylottoplancom-vite-1`, so flix's Vite silently moves to 5174; start it with `--port 5174 --strictPort` so the check scripts hit the right page.
tags: [dev, vite, mac, ports]
symptom: "Vite prints 'Port 5173 is in use, trying another one'; check scripts drive the wrong app"
found: 2026-10-30
status: current
verified: 2026-10-30
updated: 2026-10-30
related: [dev-setup, mobile-checks, check-scripts-attached-to-stale-chrome]
---

# Port 5173 on this Mac belongs to another project's container

## Symptom

`pnpm dev` starts Vite on 5174 with a "Port 5173 is in use" notice, or a check script pointed
at `http://localhost:5173` screenshots a different application entirely.

## Cause

An OrbStack container from another project, `mylottoplancom-vite-1`, listens on 5173. It is
not a stale flix Vite, so killing "the old dev server" does nothing.

## Fix

Run Vite pinned to the next port and refuse to drift:

```sh
pnpm --filter @flix/web exec vite --port 5174 --strictPort
```

and give the check scripts `http://localhost:5174`.

## Avoid

[[dev-setup]] and [[mobile-checks]] use 5174 on this Mac. If a check script's screenshot
looks unfamiliar, check what owns the port with `lsof -nP -iTCP:5173 -sTCP:LISTEN`.
