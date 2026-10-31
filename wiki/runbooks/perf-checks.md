---
title: Measure flix's performance
kind: runbook
summary: The three read-only measurement scripts (API latency per route with Stash query counts, media proxy headers and cache hits, client load and scroll cost per route in headless Chrome) and the 2026-10-31 baseline.
tags: [perf, testing, headless, scripts]
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [scripts/api-latency.sh, scripts/media-probe.sh, scripts/perf-check.mjs]
related: [caching, media-proxy, mobile-checks, prod-checks-read-only, scripts-library, 2026-10-31-ux-audit]
---

# Measure flix's performance

All three are read-only (GET only; the Chrome one blocks every write route) and may run against
production ([[prod-checks-read-only]]). They came out of the 2026-10-31 UX audit
([[2026-10-31-ux-audit]]); the audit's own numbers are in `docs/audits/2026-10-31-ux/`.

## Steps

```sh
# every GET API route, 4 samples: ms, bytes, headers, Stash queries per sample (TSV)
scripts/api-latency.sh http://flix.lan 4 > /tmp/routes.tsv

# media proxy: two passes per URL, did the BFF go to Stash, which cache headers
scripts/media-probe.sh http://flix.lan '/media/stash/scene/2775/screenshot?w=640' /media/stash/scene/2775/preview

# client: per route, cold load + second load, phone then desktop (Vite on 5174 against prod)
FLIX_SERVER=http://flix.lan pnpm --filter @flix/web exec vite --port 5174 --strictPort &
node scripts/perf-check.mjs /tmp/pf-phone http://localhost:5174 / /browse /scene/2775 /performer/447 /tags
DESKTOP=1 W=1440 H=900 node scripts/perf-check.mjs /tmp/pf-desk http://localhost:5174 / /browse
SCROLL=5 node scripts/perf-check.mjs /tmp/pf-scroll http://localhost:5174 /browse
```

## What good looks like (2026-10-31 baseline)

- Warm API: 41 of 43 routes under 10 ms p50, gzip 5–7×. Cold outliers: `/api/scenes/facets`
  1.2–2.2 s, `/api/tags/tiles` 0.9–1.0 s, `/api/whisparr/performer/:id` page 1 1.3–4 s.
- Media: every asset from disk in 3–20 ms; cards 13–25 KB WebP; resized copies have no ETag.
- Client, phone: DCL 35–200 ms, LCP 70–620 ms (Tags the worst), CLS 0.10 on Home and
  0.17 on a studio page (late-inserted rows), one 120–130 ms long task on Home and Tags.
- Scroll: a Browse page append costs 58 ms at 80 cards and 190 ms at 760 (whole-grid re-render).

Re-run after a performance change and put the before/after numbers in the history page.
