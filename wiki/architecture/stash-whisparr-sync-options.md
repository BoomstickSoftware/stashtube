---
title: Sync between flix, Stash and Whisparr (proposal)
kind: architecture
summary: Which flix–Stash–Whisparr workflows are worth syncing (follow, block, delete, imports), which are not, and a reconcile-loop design that keeps a down service from breaking anything; waiting on the user's choices.
tags: [sync, stash, whisparr, architecture, proposal]
status: proposed
verified: 2026-11-02
updated: 2026-11-02
code: [apps/server/src/api.ts, apps/server/src/whisparr.ts, apps/server/src/stash.ts, apps/server/src/sweep.ts]
related: [whisparr-nothing-monitored, stash-owns-activity, people-pages, delete-via-whisparr, whisparr-shelf, blocklist-and-exclusions]
---

# Sync between flix, Stash and Whisparr (proposal)

**Status: proposed 2026-11-02, nothing built.** Workflows 1 and 2 need the user to change
[[whisparr-nothing-monitored]] and rule 9 of `CLAUDE.md` ("flix must never gain a code path
that monitors … a studio or performer").

## Who owns what today

| Fact | Owner | flix today |
|---|---|---|
| Follow (favourite) a performer or studio | Stash | the heart writes Stash ([[people-pages]]) |
| Ratings, plays, resume, O, markers, tags | Stash | read and written through `stash.ts` ([[stash-owns-activity]]) |
| Files on disk, downloads, monitoring | Whisparr | one-scene Get, Delete with files ([[whisparr-shelf]], [[delete-via-whisparr]]) |
| New file → Stash scene, cover, performers | Whisparr's "Stash" connection: Scan, then Identify | flix's change poll notices it ([[caching]]) |
| Blocklist, playlists, stations, settings | flix (Postgres) | |
| Catalogue of scenes not owned | StashDB | the shelf ([[stashdb]]) |

So a cross-service rule always has a source of truth to read and a target to write. Every
proposal below writes the target only; it never makes the click itself depend on the target.

## Candidate workflows

| # | Workflow | Recommendation |
|---|---|---|
| 1 | **Follow a performer → Whisparr monitors that performer's new releases.** Unfollow → stops. | **Build.** It is what was just done by hand for 30 performers; doing it by rule keeps it true, including favourites set in Stash's own UI. |
| 2 | Follow a studio → monitor the studio's new releases | **Not now.** Studios publish far more than performers; the 2026-10-28 incident started with studios (`private/wiki/gotchas/whisparr-bulk-search-stalls-imports.md`). Make it a per-studio switch later if wanted. |
| 3 | **Block a performer or studio in flix → make sure Whisparr does not monitor it** (and unfollow wins over nothing: a blocked favourite is not monitored) | **Build.** Safe direction (only ever turns monitoring off). |
| 4 | Delete in flix → Whisparr deletes with an import exclusion | **Already done** (`deleteMovie` passes `addImportExclusion=true`), which matters once 1 exists: RSS would otherwise re-grab a deleted new release. |
| 5 | Whisparr import → Stash scan + Identify | **Already done** by Whisparr's Stash connection (`private/wiki/integrations/whisparr-instance.md`). flix adds nothing. |
| 6 | Show sync state in flix: on a performer page "Watching for new scenes" and what is queued or downloading for them | **Build** (read-only, cheap): Whisparr's queue already reaches the shelf. |
| 7 | "Not interested" or a 1-star rating → Whisparr import exclusion for that StashDB scene | **Skip.** The scene is already owned, so there is nothing to exclude; its file goes only through Delete. |
| 8 | Ratings, plays, O-counts → Whisparr | **Skip.** Whisparr has no use for them. |
| 9 | Whisparr monitored or grabbed something nobody follows → tell flix | **Report only**: a drift line in Diagnostics, never an automatic unmonitor of things flix does not own (see ownership). |
| 10 | Stash favourite ↔ StashDB favourite | **Skip.** StashDB favourites are not used anywhere. |

## Design for 1, 3 and 6: a reconcile loop, not chained calls

- **The click writes one system only.** Follow still writes just the Stash favourite and
  answers at once. A Whisparr outage cannot fail or slow a follow.
- **A reconciler in the BFF** computes the desired Whisparr state from Stash favourites minus the
  blocklist, reads Whisparr's actual performer flags, and applies the difference. It runs a few
  minutes after start, every 15 minutes, and soon after the change poll sees a performer change.
  Level-triggered: no queue of pending writes to lose; a run that fails is simply repeated later.
- **Down services**:
  - Stash down: skip the run. Never read "no answer" as "no favourites", which would unmonitor
    everyone (the same guard as `sweep.ts`'s `MAX_SHARE`).
  - Whisparr down or unconfigured: skip, record the error, the UI keeps working.
  - Postgres down: no blocklist, so skip (3 cannot be computed).
- **Bounded writes**: at most N changes per run (say 20) and a stop if a run would change more
  than a share of the managed set; anything larger is logged for a human.
- **Ownership**: flix manages only Whisparr performers it tagged (a Whisparr tag `flix`). A
  performer monitored by hand in Whisparr without the tag is reported, never changed. The 30 set
  by hand on 2026-11-02 get the tag at rollout.
- **What "monitor" means here**: `monitored=true`, `whisparrMonitorNewItems=true`,
  `searchOnAdd=false`, `afterDate` = the follow date, and never a search command. Verified for
  the flags on 2026-11-02 (no back-catalogue scene became monitored, nothing was searched);
  `afterDate` is still to be tested.
- **A followed performer Whisparr does not know yet** has to be added (`POST performer` by StashDB
  id, unmonitored back catalogue). To be tested on one performer first: whether adding brings
  every past scene in as an unmonitored row, and how long the refresh takes on the N5105.
- **Off switch and dry run**: a Settings switch, off by default; while off, Diagnostics shows the
  plan ("would monitor 3, unmonitor 1") so the first switch-on is not a surprise.
- **Visible state** (6): `/api/sync/status` (last run, planned, applied, errors) in Settings →
  Diagnostics and a small "Watching for new scenes" line on the performer page.
- **Private session**: following is not watch history, so [[private-session]] does not apply,
  but the reconciler is a new writer and gets the same review as other writes.
- **Quality**: new grabs use the performer's quality profile (22 of the 30 are on "Any"); the
  reconciler could set a chosen profile on the performers it manages.

## Decisions for the user

1. Allow workflow 1 (follow → monitor new releases), which narrows [[whisparr-nothing-monitored]]
   and rule 9 to "never a back catalogue, never a search, only tagged performers".
2. Workflow 2 (studios): no, or a per-studio opt-in.
3. Which quality profile flix should give the performers it manages, if any.
4. Whether the reconciler starts in dry-run for a week before applying.
