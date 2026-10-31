---
title: The deploy run failed because trivy could not download its vulnerability DB
kind: gotcha
summary: A deploy run that stays running far past 8 min and then fails in the build step with no code change was trivy timing out on mirror.gcr.io's vulnerability DB; nothing was pushed, so re-run the job.
tags: [ci, forgejo, trivy, deploy]
symptom: "FATAL Fatal error run error: init error: DB error: failed to download vulnerability DB: ... mirror.gcr.io/aquasec/trivy-db:2: oci download error: copy error: context deadline exceeded"
found: 2026-10-31
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [.forgejo/workflows/deploy.yml]
related: [forgejo-ci, deploy-and-verify]
---

# The deploy run failed because trivy could not download its vulnerability DB

## Symptom

`node scripts/deploy-check.mjs` keeps printing `waiting for <sha>: running <old sha>` past its
limit; `tea actions runs` shows the run `running` for ~13 min, then `failure`. The build step
(11 min) ends with the line above after trivy's `Downloading vulnerability DB...` sat for
exactly 5 min. The registry has no image for the sha and the k8s repo no bump commit: the
image was built and the tests passed, then the scan never ran.

## Fix

Re-running did not help (run 80, 54a5932, failed twice the same way, 2026-10-31). Measured
from the LAN that evening with `trivy image --download-db-only --db-repository <repo>`:
`mirror.gcr.io/aquasec/trivy-db:2` 15-60 KiB/s, `ghcr.io/aquasecurity/trivy-db:2` 15 KiB/s,
`public.ecr.aws/aquasecurity/trivy-db:2` ~200 KiB/s (44% in 5 min), while
`docker.io/aquasec/trivy-db:2` took 33 s at 3 MiB/s and a 20 MB Cloudflare test ran at
3.5 MB/s: the OCI registries were throttled on this ISP's path, not the WAN or the runner.
`deploy.yml` now (a) keeps the DB in a dind named volume `trivy-cache` (dind's volumes live on
its PVC and `cache-gc` prunes images, build cache and containers only), (b) lists Docker Hub
first in `--db-repository`, then Google's mirror, then ghcr, (c) sets `--timeout 15m`, which
covers the download. Docker Hub's anonymous pull limit (100 per 6 h per IP) is far from
reach with the cache. To re-run a failed job by hand: Forgejo → the run → **Re-run all
jobs**, then `TIMEOUT=1200 node scripts/deploy-check.mjs`.

## Reading the log

`tea actions runs logs <id>` fails on Forgejo 15.0.10 (`/actions/runs/<id>/jobs` is 404), and
`get_page_text` on the run page returns nothing: the log view is a Vue app. Open the run page
in a signed-in browser, click the step row in the right-hand pane to expand it, then read the
`.job-step-logs` text. [[forgejo-ci]] has the pointers.

## Cause

The registries trivy defaults to were throttled from this network for hours while the WAN
and Docker Hub were fast. Nothing in flix. The log for a run cannot be read with tea on this
Forgejo; see "Reading the log" above.
