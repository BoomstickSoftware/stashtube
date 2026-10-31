---
title: Wiki conventions
kind: hub
summary: How every page in this wiki is named, structured, tagged, linked, indexed and kept true; read before writing or editing a page.
tags: [wiki, meta]
related: [index, log]
status: current
verified: 2026-10-30
updated: 2026-10-30
---

# Wiki conventions

This wiki follows Karpathy's "LLM wiki" pattern: the code and the live systems are the raw
sources, the wiki is the compiled knowledge, `CLAUDE.md` is the schema that tells the agent how
to use it. Humans read it (Obsidian opens `wiki/` as a vault; `[[slug]]` links work there);
the agent writes it.

## One page, one question

A page answers one question and stops. "How does the asset cache decide what to evict?" is a
page. "Caching" is a hub that links to pages. Rules of thumb:

- A page is **under 120 lines of body**. Past that, split it and leave a hub page behind.
- Facts live in **exactly one page**. Other pages link to it with `[[slug]]`; they do not repeat
  it. If you must restate a number, link to the page that owns it.
- A reader who lands on a page from the index must not need to read a second page to act on it.
  Prerequisites are named and linked in the first lines, not re-explained.
- Code is the truth for *how*; the wiki holds *what, why, where, and what went wrong*. Put a
  `code:` list in the frontmatter instead of pasting the implementation. Short snippets
  (a command, an env line, a query) are fine.

## Directories = kinds

| Directory | `kind` | Holds | Page title shape |
|---|---|---|---|
| `architecture/` | `architecture` | How a part of flix is built and why it has that shape | noun: "Media proxy" |
| `features/` | `feature` | What the user can do, how it behaves, where it lives in the code | noun: "Stations" |
| `integrations/` | `integration` | The flix-facing facts about an external system (Stash, Whisparr, StashDB, CNPG, NFS, k8s, Forgejo). Only what flix needs; link to the owning repo for the rest | system name |
| `decisions/` | `decision` | One decision each: context, decision, consequences, who decided, when. Never re-open one without the user | imperative or statement: "Keep Stash as the headless backend" |
| `runbooks/` | `runbook` | Steps to do a thing: set up, check, deploy, regenerate, recover | verb phrase: "Regenerate the Stash schema types" |
| `gotchas/` | `gotcha` | One pitfall each: symptom, cause, fix, how to avoid. Searchable by the error text | the symptom: "Tag filter has no id criterion" |
| `history/` | `history` | Dated, immutable write-up of a round or incident: what changed, how it was verified. Never edited after the fact except to add a "Superseded by" line | `YYYY-MM-DD-topic` |
| `wiki/` root | `hub` | `index.md`, `log.md`, `roadmap.md`, this file | |

## File names and links

- The **slug is the file name** without `.md`: lower-case, kebab-case, ASCII, unique across the
  whole wiki regardless of directory (`node scripts/wiki.mjs lint` enforces it). History pages
  start with the date: `2026-10-30-featured-ranking`.
- Link with `[[slug]]`, never with relative paths. Anchor to a heading with `[[slug#heading]]`.
- Point at code with repo-relative paths in prose or in `code:`; point at other repos with the
  `repo:path` form used in `sources:` (`nas:docs/services.md`, `k8s:docs/flix.md`,
  `flotilla:docker-compose.yml`). The repos are listed in `CLAUDE.md`.

## Frontmatter schema

Every page starts with YAML frontmatter. Required keys first, optional after.

```yaml
---
title: Media proxy                     # human title, matches the H1
kind: architecture                     # one of the kinds above
summary: >-                            # ONE sentence; the index shows it; the search ranks on it
  Why the browser never talks to Stash, and what /media/stash and /media/play do.
tags: [media, stash, proxy, security]  # 2–6, lower-kebab; reuse existing tags (see index.md "Tags")
status: current                        # current | superseded | proposed | record (history only)
verified: 2026-10-30                   # last date the page was checked against code or the live system
updated: 2026-10-30                    # last edit of any kind
code: [apps/server/src/media.ts, apps/web/src/lib/media.ts]   # optional: where the truth is implemented
related: [caching, stash-api]          # optional: slugs worth reading next
sources: [nas:docs/services.md]        # optional: outside-repo documents this page distils
---
```

Per-kind extras:

| kind | extra keys |
|---|---|
| `gotcha` | `symptom: "No QueryClient set"` (the exact text a search would use), `found: YYYY-MM-DD` |
| `decision` | `decided: YYYY-MM-DD`, `by: user` or `by: agent, confirmed by user`; `status` may become `superseded` with a `superseded_by: slug` |
| `history` | `date: YYYY-MM-DD`, `commits: [sha, …]` when known; `status: record` |
| `feature` | `routes: [/station, /stations]` and `api: [GET /api/stations/previews]` when they exist |

Dates are ISO (`2026-10-30`). A measured number in the body carries its date in the same
sentence: "the home feed goes 108 KB → 17 KB gzip'd (measured 2026-10-29)".

## Body templates

**architecture / feature / integration**

```
# Title
One paragraph: what it is and the one thing to know.
## How it works          (or: Behaviour)
## Where                 code paths, routes, tables, env (bullets)
## Limits and numbers    measured facts with dates
## See also              [[links]] not already in the text
```

**decision**

```
# Title
**Decided** YYYY-MM-DD by …  **Status** current
## Context      what was true / what the choice was between
## Decision     one or two sentences
## Consequences what follows, including what we deliberately do NOT do
## Revisit if   the condition that would reopen it
```

**runbook**

```
# Title
When to use it, in one line. Prerequisites as [[links]].
## Steps        numbered; every command in a fenced block; say what the expected output is
## If it fails  the known failure modes, each linking its [[gotcha]]
```

**gotcha**

```
# Symptom as the title
## Symptom      exact text, where it shows, how it was noticed
## Cause
## Fix          what was changed (and where: code paths / commits)
## Avoid        the rule that prevents it; which test or check pins it
```

**history**

```
# YYYY-MM-DD: Title
## What changed      bullets, each naming the feature/architecture page it affected
## How it was verified
## Snags             things that went wrong on the way (each should also be a gotcha if it can recur)
```

## Superseding, never accumulating

When a fact changes, change it **in place** in the page that owns it, bump `updated` (and
`verified` if you checked it), and keep the old value only when it explains something:
"_was 9333 until 2026-10-29_". Then `grep -rn` the old value across `wiki/` and `CLAUDE.md`
and fix every repeat. A history page records that the change happened; the current page
records only what is true now.

Mark what you do not know. "inferred" for a guess with its basis; a `## Not yet known` list
for open questions, rather than silence or a confident wrong number.

## Index and log

- `wiki/index.md` is **generated**: `node scripts/wiki.mjs index`. Never edit it by hand. It
  lists every page by kind with its summary, tags and `verified` date, then every tag with
  its pages. Read it first when you do not know which page you need.
- `wiki/log.md` is **append-only**, one entry per operation, newest last:
  `## [YYYY-MM-DD] <op> | <title>` followed by one to three lines. Ops: `init`, `ingest`
  (new knowledge from code, a session or another repo), `correct` (a page was wrong),
  `decide`, `lint`, `query` (an answer worth filing). `grep '^## \[' wiki/log.md | tail -5`
  shows the recent ones.

## Tooling

`scripts/wiki.mjs` (Node, no dependencies; run from the repo root):

| Command | Does |
|---|---|
| `node scripts/wiki.mjs search <words…> [--kind k] [--tag t]` | Ranks pages by hits in title, tags, symptom, summary, then body; prints the top matches with the matching lines. **Run this before reading pages by hand.** |
| `node scripts/wiki.mjs index` | Regenerates `index.md` from the frontmatter |
| `node scripts/wiki.mjs lint` | Fails on missing or invalid frontmatter, duplicate slugs, broken `[[links]]`, a stale index; warns on orphans, pages over 120 body lines, `verified` older than 60 days |
| `node scripts/wiki.mjs tags` | Tag counts, to pick an existing tag |
| `node scripts/wiki.mjs stale [days]` | Pages whose `verified` is older than `days` (default 30) |

Run `index` then `lint` after any wiki edit, before ending the session.
