---
title: Investigate without seeing library content
kind: runbook
summary: How to look at flix, Stash, Whisparr, Postgres, the logs and the UI as ids, counts and shapes with every library name tokenised (neutral.mjs, --neutral, neutral screenshots), and what can still leak.
tags: [privacy, scripts, context, headless, operations, testing]
status: current
verified: 2026-11-10
updated: 2026-11-10
code: [scripts/neutral.mjs, scripts/lib/neutral.mjs, scripts/lib/neutral.test.mjs, scripts/lib/neutral-pod.mjs, scripts/lib/neutral-page.mjs, scripts/phone-flow.mjs, scripts/mobile-check.mjs, scripts/desktop-check.mjs, scripts/arrlib/core.py]
related: [scripts-library, gather-context, mobile-checks, prod-checks-read-only, stash-and-whisparr-clients, library-reconcile, github-public-mirror]
---

# Investigate without seeing library content

Use for every look at live data in an assistant session. The library is adult content and its
words (performer, studio, scene, category, indexer and release names, titles, descriptions,
file paths) are not to enter a chat transcript. **Working rule: neutral scripts first; ids in,
counts out.** Name a thing by its id (`scene 3079`, `tag id 41`), never by its name; ask for a
count, a shape or a timing, not a listing. The user, in their own terminal, can turn an id back
into a name; the assistant does not need to.

## How it works

One allow-list ([[scripts-library]]: `scripts/lib/neutral.mjs`, unit-tested, run by
`check.mjs`) decides what a string may show:

- kept: object keys that look like schema names, numbers, booleans, null, and strings of a
  neutral **shape**: integer or uuid ids, hashes, ISO dates and times, durations, versions, mime
  types, resolutions, addresses;
- kept under an **enum key** only (`kind`, `status`, `state`, `sort`, `eventType`, codecs, …)
  when one token long;
- **URLs** keep their route: ids and known route words stay, every other segment is `*`, query
  keys stay with neutral values, an unknown host becomes `<host #hash>`;
- **never kept**, whatever its shape, under a content key (`name`, `title`, `details`, `aliases`,
  `q`, …); a filesystem path becomes `<path:depth=N ext=mp4 #hash>`;
- everything else becomes `<str:LEN #HASH>`. The hash is salted (`private/neutral.salt`, made on
  first use), so equal strings can be matched across runs and tools without being readable;
- free text (log lines, error messages): quoted strings are tokenised, a word stays only if it
  is in the vocabulary built from the server's own source, so flix's messages read normally;
- a last net: finished output passes the privacy check's deny-lists (`private/denylist*.txt`)
  and a hit is replaced by `<deny>` and counted. It should never fire; if it does, tighten the
  allow-list.

Stash, Whisparr and Postgres are read from **inside the flix pod** (`kubectl exec`, like
[[library-reconcile]]): the keys are there, the Mac needs no `.env`. The pod-side fetcher
(`scripts/lib/neutral-pod.mjs`) only reads: Stash queries (a mutation is refused twice, here and
there), Whisparr GETs, Postgres in a `READ ONLY` transaction. Its raw answer is captured, never
printed; only the redacted form reaches the terminal, error paths included.

## Steps

```sh
# flix's API: status, ms, bytes on the wire, cache headers, then one line per JSON path
node scripts/neutral.mjs api '/api/scenes?perPage=24' --n 5
node scripts/neutral.mjs api /api/scenes/<id> --full          # the redacted JSON
node scripts/neutral.mjs api '/api/scenes?perPage=40' --pick '$.items[].id'   # ids out
node scripts/neutral.mjs routes                                # what there is to GET

# Stash and Whisparr
node scripts/neutral.mjs stash summary        # counts by entity, missing metadata, job queue
node scripts/neutral.mjs stash q '{ findScene(id: <id>) { id organized files { video_codec width } } }'
node scripts/neutral.mjs whisparr summary     # files, monitored (rule 9), queue, history, health
node scripts/neutral.mjs whisparr get queue pageSize=50

# flix's own tables, and the pod's log
node scripts/neutral.mjs db                   # rows, nulls, id and time ranges, enum counts, jsonb shape
node scripts/neutral.mjs db sql 'select kind, count(*) from blocks group by 1'
node scripts/neutral.mjs logs --since 1h      # requests by route+status with ms; other lines scrubbed
node scripts/neutral.mjs logs --since 1h --lines

# any other tool: scrub what it prints (JSON, JSON lines, TSV with a header, or text)
scripts/whisparr.py --neutral queue --json          # the clients do it themselves with --neutral
<command> 2>&1 | node scripts/neutral.mjs redact
```

Expected: no line contains a name. A shape line reads
`$.items[].title  text ×24 len 12/37/110 distinct 24` (count, length min/median/max, distinct
values); ids are listed (`id ×24 distinct 24: 3079,3081,…`); enums are counted.

**The UI** ([[mobile-checks]]): `phone-flow.mjs`, `mobile-check.mjs` and `desktop-check.mjs` are
neutral by default. Every `/api` answer is rewritten before the app sees it (titles, names and
descriptions become filler with the same length, word lengths and capitals, so wrapping and
truncation are real), every `/media` picture is answered with a grey placeholder, video and
canvas are flattened to grey by a stylesheet while the stream still plays. A screenshot is
written only after the page confirms all three (`NOT NEUTRAL, <name>.png withheld` otherwise).
A neutral run uses its own browser profile (`<outdir>/profile-neutral`), because the app
persists its query cache. `tapText` finds the app's own labels only: open things by id
(`{"goto":"/scene/<id>"}`) or by selector. `--content` (or `CONTENT=1`) shows the real library:
only when the user asks for it.

## What can still leak

- **Every headless script is neutral by default** (since 2026-11-10): `touch-check`,
  `mini-check`, `card-check` and `webkit-mini-check` use the same masking and placeholders as
  `phone-flow`; `perf-check` needs the real responses for its numbers, so it prints routes, ids,
  sizes and timings and saves a screenshot only with `--content`.
- **Names on request only**: `library-reconcile.mjs` and `whisparr-sync.mjs` print counts and ids
  unless `--names`; `privacy-check.mjs` reports `file:line` and the term's length unless `--show`.
  The server logs a deleted video by id and replaces search text in request lines with `…`.
- **Still raw**: `stash.py` / `whisparr.py` without `--neutral`, raw `curl` of the API, and pod
  logs written before 2026-11-10. Pipe them through `neutral.mjs redact`.
- **Files**: `private/` (the private wiki, deny-lists, Whisparr snapshots) is content by
  definition; do not read it. A `--content` screenshot is content.
- **Static copy**: the app's own labels and the tracked source are shown as they are (the
  ethnicity filter's options, the Cast category labels).
- **Allow-list edges**: a single lower-case word used as an object key in a small map, and a
  log word that is also in the server's source vocabulary, would pass the allow-list; the
  deny-list net covers performer, studio and indexer names, not category names or titles.
- **What the assistant types**: a search term or a name in a command is in the transcript
  before any script runs. Use ids.
- **Ids are pointers**: a StashDB uuid or a scene id is neutral text but resolves to content for
  anyone who looks it up.

## If it fails

- `the fetcher gave no JSON`: `kubectl` cannot reach the pod; `kubectl -n flix get deploy flix`.
  With a filled `.env`, `--local` runs the fetcher on the Mac instead.
- `(deny-list net: N replacement(s))`: the allow-list let a library name through; find the key
  or shape that kept it and tighten `scripts/lib/neutral.mjs`, with a test.
- `NOT NEUTRAL … withheld`: `real` counts pictures that did not come from the placeholder,
  `flat:false` a video or canvas without the stylesheet; fix `scripts/lib/neutral-page.mjs`,
  never work around it with `--content`.
- The scene page's playlist dialog stays empty in a `--content` run: Chrome matches the blocked
  pattern `*/api/scenes/*/play` as a prefix, so `GET /api/scenes/<id>/playlists` is blocked too.
  Neutral runs block through `neutral-page.mjs`, anchored, and do not have this (fixed 2026-11-10).
