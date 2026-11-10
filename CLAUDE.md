# flix

A tube-style web front end for the adult library on the NAS. **Stash is the headless backend**
(scans, fingerprints, StashDB metadata, sprites and previews, VAAPI transcodes on the NAS's
N5105); flix is a Hono BFF plus a React web app that add what Stash lacks: a home feed,
ranking, playlists, a blocklist, stations, a phone-first player. Single user, LAN only, live at
http://flix.lan on the k8s cluster. **Everything known about flix is in `wiki/`**; this file
tells you how to use it and the few rules that must be in every session.

| Repo | Owns |
|------|------|
| this (`~/code/flix`) | flix code, Dockerfile, CI workflow, **`wiki/`** (the knowledge base). `origin` is Forgejo and deploys; `github` is the public mirror BoomstickSoftware/stashtube, pushed by hand after origin (`wiki/decisions/github-public-mirror.md`) |
| `~/code/nas` | The NAS itself: OS, disks, the NFS export flix reads, the other arr apps, Prowlarr, SABnzbd, qBittorrent. **Stash and Whisparr are operated from this repo since 2026-11-02**: `scripts/stash.py`, `scripts/whisparr.py`, `private/wiki/integrations/stash-instance.md`, `private/wiki/integrations/whisparr-instance.md` |
| `~/code/flotilla` | The compose stack that runs Stash and Whisparr on the NAS |
| `~/code/k8s` | Where flix runs: `infra/flix/` manifests, secrets script, CNPG database, `docs/flix.md` |

## The wiki is the memory: use it first, keep it true

`wiki/` is a Karpathy-style LLM wiki: small pages, one question each, YAML frontmatter, `[[slug]]`
links, a generated `index.md`, an append-only `log.md`. Conventions (schema, templates, naming,
kinds) are in `wiki/CONVENTIONS.md`: read it before writing a page. Tooling: `node scripts/wiki.mjs`.

**Before** answering a question, planning a change or touching code:

1. `node scripts/wiki.mjs search <words>` (add `--kind gotcha` for an error, `--tag <t>` to narrow).
   Read only the pages it returns, not whole directories. If nothing matches, skim `wiki/index.md`
   (one line per page) and pick from there.
2. Treat a page as true until the code or the live system contradicts it. When they disagree, the
   wiki is wrong: fix it (step 4), then proceed from the code.
3. Never re-open a `decisions/` page without the user. Propose, do not assume.

**After** learning anything that cost effort (a command that works or fails, a path, a default, a
limit, a number, a failure mode, a user preference or decision):

4. Put it in the page that owns the topic, **in place**. New fact → the right `kind` directory;
   contradiction → change the record, keep the old value only if it explains something ("_was X
   until DATE_"), then `grep -rn` the old value across `wiki/` and this file and fix every repeat.
   Bump `updated`; bump `verified` when you checked it against code or the live system.
5. An error that took more than one attempt to get past becomes a `gotchas/` page keyed by its
   symptom text. A choice the user makes becomes a `decisions/` page. A finished initiative becomes
   a dated `history/` page (what changed, how verified, snags) and an update to `wiki/roadmap.md`.
   Current behaviour lives in `features/` or `architecture/`, never in a history page.
6. A fact about another system belongs in `integrations/` only as far as flix needs it, with a
   `sources:` pointer to the owning repo's doc. Do not restate the nas or k8s docs. **Exception:
   Stash and Whisparr are owned here** (moved from the nas repo 2026-11-02): their whole
   configuration and operations live in `private/wiki/integrations/{stash,whisparr}-instance.md`,
   the private runbooks and gotchas they link, and `private/ops/`.
7. Append a `log.md` entry (`## [YYYY-MM-DD] ingest|correct|decide|query | title`). Then run
   `node scripts/wiki.mjs index && node scripts/wiki.mjs lint` and fix what it reports. Do this
   before ending any session that edited the wiki.
8. **Library content never enters git.** The repo is mirrored publicly
   (`wiki/decisions/github-public-mirror.md`). A page or file that names a performer, studio,
   scene, indexer or download goes in the gitignored `private/wiki/<kind>/` (same frontmatter;
   searched, indexed into `private/wiki/index.md` and linted with the rest). A tracked page never
   links a private one; it may name the path in backticks. `node scripts/privacy-check.mjs` (run
   by `check.mjs`) fails on any library name in a tracked file.
9. An answer you assembled from several pages that someone will ask again is worth filing as a page
   (`query` op). Chat history is not memory; the wiki is.

Auto-memory (`~/.claude/projects/...`) is for cross-repo user preferences only. Project facts go here.

## Scripts are the hands: use one first, write one when none fits

The wiki holds what is known; `scripts/` holds what can be done, registered in
`scripts/manifest.json`. Full runbook: `wiki/runbooks/scripts-library.md`.

1. **Before doing an operations task by hand** (checking, deploying, verifying, measuring,
   regenerating, gathering context), run `node scripts/scripts.mjs search <words>` and use what
   it finds, exactly as its usage line says.
2. **If nothing fits and a script would do the job to a high standard, write the script**, then
   do the task with it. Register it in `scripts/manifest.json` (name, file, does, usage, env,
   writes, tags, wiki) and name it in the wiki page that owns the task. A script that reaches
   Stash, Whisparr or the cluster is read-only unless the user asked for the write.
3. **A script that fails or falls short gets fixed, not bypassed.** If the failure can recur,
   it also becomes a `gotchas/` page.
4. `node scripts/scripts.mjs lint` must pass before the session ends (every file in `scripts/`
   registered, every entry's file and wiki page present).

The checks and the deploy are scripts already: `node scripts/check.mjs [--docker]` before a
commit, `node scripts/deploy-check.mjs` after a push.

## Gathering context from other systems

Record only the flix-facing fact in `wiki/integrations/`; link the source. Details: `wiki/runbooks/gather-context.md`.

| Question | Where to look | Command (read-only) |
|---|---|---|
| What does Stash's schema accept? Why did a query fail? | Stash GraphQL via `scripts/stash.py` (key from flix's `.env`, never printed) | `scripts/stash.py q '{ __type(name:"TagFilterType"){ inputFields { name } } }'` |
| What is Whisparr's state, what does its API return? | `scripts/whisparr.py` (key from flix's `.env`) | `scripts/whisparr.py get movie\|studio\|queue --json`; `private/wiki/integrations/whisparr-instance.md` |
| Stash config, library layout, scans | this repo: `private/wiki/integrations/stash-instance.md`, `scripts/stash.py status` | NFS export: nas repo | `nas:docs/services.md` stash row, `nas:docs/network.md`, `nas:docs/operations.md` |
| How is flix deployed, which secrets, which IP, backups | k8s repo (its clone may be on a side branch) | `cd ~/code/k8s && git show origin/main:infra/flix/deployment.yaml`, `git show origin/main:docs/flix.md` |
| What is running right now | the cluster | `kubectl -n flix get deploy flix -o wide`, `node scripts/neutral.mjs logs --since 5m`, `curl -s http://192.168.1.152/healthz` |
| What does flix, Stash, Whisparr or Postgres hold (counts, shapes, ids) | `scripts/neutral.mjs` (rule 12) | `node scripts/neutral.mjs api '/api/scenes?perPage=24'`, `… stash summary`, `… whisparr summary`, `… db` |
| Did the last push deploy | Forgejo | `tea actions runs` (status per run, newest first); the run of `.forgejo/workflows/deploy.yml` at git.lan:3000/zbmowrey/flix/actions; a failure is posted to the forge Discord channel |

## Rules that must be in every session

Each has a wiki page with the full story; these are the one-line versions.

1. **The browser never talks to Stash or sees the API key.** Stash URLs go through `mediaUrl()` →
   `/media/stash/...`; StashDB covers through `/media/remote/<token>`, never hotlinked
   (`wiki/architecture/media-proxy.md`).
2. **Stash owns ratings, play counts, resume points, O-counts, markers, favourites, titles and tags.**
   Postgres holds only what Stash cannot: playlists, blocklist, pinned rows, stations, settings
   (`wiki/architecture/data-model.md`, `wiki/decisions/stash-owns-activity.md`).
3. **The web app knows only `@flix/shared` types**, never Stash shapes. Only `apps/server/src/stash/`
   (behind the `stash.ts` barrel) knows Stash's schema; a test fails if another file imports it
   (`wiki/architecture/stash-layer.md`).
4. **Block stops downloads, Unlist keeps owned videos off what flix picks, Not interested deletes.**
   The blocklist applies to Discover, the not-downloaded shelf and the automatic Gets, never to
   library lists; library finders call `exclusions()` and feeds `curated()`
   (`wiki/architecture/blocklist-and-exclusions.md`, `wiki/decisions/hide-means-delete-block-or-unlist.md`).
5. **Server code is erasable TypeScript**; the other coding conventions and their pitfalls are in
   `wiki/architecture/coding-conventions.md` and `wiki/gotchas/`.
6. **The iPhone (17 Pro Max) is the primary client: polish it over everything else; the desktop
   only has to be fine.** Verify every web change at phone size first. Touch conventions:
   `wiki/architecture/mobile-first-ui.md`, decision `wiki/decisions/iphone-first-polish.md`.
7. **Never read or print `.env`, never copy a key from another repo's `.env`.** The user fills
   `.env` by hand; in k8s the secrets come from `infra/flix/create-secrets.sh`.
8. **Checks against Stash must not write.** The headless check scripts block plays, activity,
   deletes, Whisparr gets, markers, O and ratings; `FLIX_SERVER=http://flix.lan` is for the check
   scripts only (`wiki/decisions/prod-checks-read-only.md`).
9. **Whisparr monitors only the scenes flix fetched.** Every performer and studio there stays
   unmonitored, followed ones too; global "monitor new items" is off. flix finds followed ones'
   new releases in its StashDB mirror and fetches each scene with one search, through the paced
   Get queue (one every 8 s); the guard (`apps/server/src/sync.ts`, `node scripts/whisparr-sync.mjs
   [--apply]` or the Settings timer) unmonitors everything else. Every StashDB call goes through
   the rate-limited queue in `stashdb.ts`. Nothing may monitor or search a whole studio or
   performer (`wiki/decisions/whisparr-nothing-monitored.md`, `wiki/architecture/stashdb-mirror.md`).
10. **Every push to `main` deploys.** Work in initiatives: verify (`node scripts/check.mjs`, a
    headless screenshot where UI changed), one commit per initiative with a plain imperative
    subject, push, then `node scripts/deploy-check.mjs`
    (`wiki/decisions/one-commit-per-initiative.md`, `wiki/runbooks/deploy-and-verify.md`).
11. **A new write that records what was watched goes through `guardWrite()` or checks `isPrivate()`**
    (`wiki/features/private-session.md`).
12. **Library content stays out of the conversation, as far as is reasonable.** A principle, not a
    hard line: the user can lift it for a task, and a real bug that needs the content outranks it
    (say so, then use `--content` / `--names` / `--show` for that step only). By default work with
    ids, counts, shapes and timings: "scene 3079", "tag id 41", "a studio". Read live data through
    `node scripts/neutral.mjs api|stash|whisparr|db|logs` (or `… redact` on a pipe, `--neutral` on
    `stash.py` / `whisparr.py`); every headless check script takes neutral screenshots by default.
    Do not type a name or title into a command, and do not read `private/` unless the task needs
    it. A new script or log line that carries live data prints ids, or goes through
    `scripts/lib/neutral.mjs` (`wiki/decisions/content-neutral-sessions.md`,
    `wiki/runbooks/neutral-observability.md`).

## Quick reference

```sh
pnpm install && pnpm db:up && cp .env.example .env    # fill STASH_API_KEY by hand
pnpm dev                                              # BFF :8080; Vite: --port 5174 --strictPort (5173 is taken)
node scripts/check.mjs [--docker]                     # typecheck, web tsc, lint baseline, tests[, image]
node scripts/deploy-check.mjs [sha] [--no-wait]       # after a push: wait for the sha, hit the smoke routes
node scripts/scripts.mjs search <words> | list | show | lint
node scripts/wiki.mjs search <words> | index | lint | tags | stale
```

Layout (details in `wiki/architecture/server-bff.md` and `wiki/architecture/web-app.md`):

```
apps/server      Hono BFF, Node 26 runs .ts natively; src/stash/ is the only Stash-aware code, src/routes/ the API, src/jobs.ts the timers
apps/web         Vite + React 19 + Tailwind 4 + TanStack Router (file routes) / Query
packages/shared  API contract types and the few values both sides need; shipped in the image
scripts/         the scripts library, registered in scripts/manifest.json (`node scripts/scripts.mjs list`);
                 stash.py and whisparr.py operate Stash and Whisparr (Python, stdlib)
private/         GITIGNORED, never committed: pages and files that name library content (performers,
                 studios, indexers, download history): private/wiki/ (searched and linted with the
                 wiki), private/ops/inventory/ (Whisparr config snapshots), private/ops/browser/
wiki/            the knowledge base (start at wiki/index.md)
```

Status, backlog and open questions: `wiki/roadmap.md`. Repo conventions: no git commits unless
asked or working an agreed initiative; commit subjects are plain imperative, one line.
