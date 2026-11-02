---
title: Operate Stash and Whisparr from flix (stash.py, whisparr.py)
kind: runbook
summary: The two stdlib Python clients moved from the nas repo, how they find their URL and key in flix's .env, the read and write commands, and the dry-run-then-apply rule for every change.
tags: [stash, whisparr, scripts, operations]
status: current
verified: 2026-11-02
updated: 2026-11-02
code: [scripts/stash.py, scripts/whisparr.py, scripts/arrlib]
sources: [nas:scripts/arr.py, nas:scripts/stash.py, nas:docs/operations.md]
related: [whisparr-nothing-monitored, gather-context, scripts-library, config-env]
---

# Operate Stash and Whisparr from flix (stash.py, whisparr.py)

Both clients came from the nas repo on 2026-11-02 (`arr.py` narrowed to Whisparr and renamed,
`stash.py` as it was), so the services flix depends on are run from here: `private/wiki/integrations/stash-instance.md`,
`private/wiki/integrations/whisparr-instance.md`. Stdlib Python 3, no installs.

## Credentials

They read flix's own `.env` (gitignored, **filled by hand**, never printed, never copied from
another repo's `.env`): `STASH_URL`, `STASH_API_KEY`, `WHISPARR_URL`, `WHISPARR_API_KEY`, the same
names the BFF uses ([[config-env]]). The nas-style `STASH_HOST`/`STASH_PORT` and
`WHISPARR3_HOST`/`WHISPARR3_PORT`/`WHISPARR3_API_KEY` also work; the URL forms are turned into
them. `ARR_ENV_FILE` overrides the file path. Without a key each client exits 2 with an `E_ENV`
line that names the variable to set.

## Whisparr

```sh
scripts/whisparr.py ping                      # env -> host -> port -> app -> key, with timing
scripts/whisparr.py status                    # version, health, disks, queue, active commands, next tasks
scripts/whisparr.py queue | history --since 24h | wanted | logs --level warn --since 1h
scripts/whisparr.py get movie --json          # raw GET of /api/v3/<path>, one pretty JSON document
scripts/whisparr.py get command --json        # what is running or queued (check before any bulk write)
scripts/whisparr.py snapshot                  # redacted config to private/ops/inventory/whisparr3/ (git diff it)
scripts/whisparr.py set performer/2650 monitored=true whisparrMonitorNewItems=true          # dry run
scripts/whisparr.py set performer/2650 monitored=true whisparrMonitorNewItems=true --apply  # sends it
scripts/whisparr.py put movie/editor @body.json --apply        # bulk monitor/unmonitor scenes
scripts/whisparr.py cmd RefreshMonitoredDownloads              # an app command, waits for it
```

- Writes (`post`, `put`, `delete`, `set`, `cmd`) are dry runs unless `--apply`. `--apply` runs
  Whisparr's Backup first; pass `--no-backup` for the second and later writes of a batch (and
  while a bulk search runs, when the Backup itself would queue behind it,
  `private/wiki/gotchas/whisparr-bulk-search-stalls-imports.md`).
- `set <resource>/<id> k=v` edits one object in place without round-tripping secrets.
- The app argument is optional (`scripts/whisparr.py whisparr3 get movie` still works).
- `PUT performer/editor` answers 400 "Root folder … does not exist" because of one performer's
  stale root; use `set performer/<id>` per performer (~1.5 s each; 4 in parallel is fine).
- Policy before any monitoring change: [[whisparr-nothing-monitored]].

## Stash

```sh
scripts/stash.py ping                         # version, schema, and that no key gets 401
scripts/stash.py status                       # counts, library paths, key settings, job queue
scripts/stash.py config                       # full configuration, redacted
scripts/stash.py q '{ findPerformers(performer_filter:{filter_favorites:true}, filter:{per_page:-1}) { count } }'
scripts/stash.py q 'mutation { metadataScan(input:{}) }'           # dry run
scripts/stash.py q 'mutation { metadataScan(input:{}) }' --apply   # sends it
scripts/stash.py jobs --wait                  # follow a scan, generate or identify
```

Mutations are dry runs unless `--apply`; bodies may use `${env:NAME}` placeholders filled from
`.env`. Output is redacted.

## Rules

- Checks from flix's scripts against production stay read-only ([[prod-checks-read-only]]);
  these clients write only when you pass `--apply`, on purpose, for an operations task.
- After a config change, `scripts/whisparr.py snapshot` and commit the diff in `private/ops/inventory/`.
- Record what a change taught in the page that owns it (`private/wiki/integrations/whisparr-instance.md`, `private/wiki/integrations/stash-instance.md`).
