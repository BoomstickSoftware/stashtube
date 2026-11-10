// Fetching through Whisparr, gently (architecture/stashdb-mirror, "Getting"):
// - The Get queue: scenes picked in a list (or found by discovery) wait in Postgres and are
//   fetched one at a time, SPACING apart, so a long selection never becomes a burst of searches
//   and survives a restart. Each fetch is the single-scene Get: add or monitor that one scene,
//   one search.
// - Waiting scenes (fetched, still without a file): Whisparr only watches RSS for new postings,
//   so flix searches each again RESEARCH_AFTER after its last search, a few per hour.
// - Discovery: once a day, each followed performer's and studio's newest StashDB scenes (through
//   the mirror) are checked; a release after the follow started that the library and Whisparr
//   lack, and that was never deleted (no import exclusion, read fresh each run), joins the queue.
//   A Get pressed by hand is respected even for a scene deleted before.
import type { WaitingScene } from '@flix/shared'
import { asc, eq, lt, or } from 'drizzle-orm'
import { db } from './db/index.ts'
import { getQueue, sdbScenes, whisparrGets, whisparrWatch } from './db/schema.ts'
import { blockedStashDbIds, type StashDbIdSets } from './blocklist.ts'
import { config } from './config.ts'
import * as catalog from './catalog.ts'
import * as stash from './stash.ts'
import * as stashdb from './stashdb.ts'
import * as whisparr from './whisparr.ts'
import { GRACE, kickSync } from './sync.ts'
import { register } from './jobs.ts'
import { getSettings } from './settings.ts'

export const SPACING = 8_000 // ms between two Gets
export const MAX_ATTEMPTS = 3
export const RESEARCH_AFTER = 7 * 86_400_000
const RESEARCH_PER_HOUR = 5
const DISCOVER_EVERY = 24 * 3_600_000
export const MAX_SELECTION = 200

export const queueStatus = { running: false, lastDiscovery: null as string | null, lastDiscoveryFound: 0, lastError: null as string | null }

export async function enqueue(stashdbIds: string[]): Promise<number> {
  const ids = [...new Set(stashdbIds)].slice(0, MAX_SELECTION)
  if (!ids.length) return 0
  const added = await db.insert(getQueue).values(ids.map((stashdbId) => ({ stashdbId }))).onConflictDoNothing().returning()
  kick()
  return added.length
}

export const cancel = (stashdbId: string) => db.delete(getQueue).where(eq(getQueue.stashdbId, stashdbId))

// One Get from the queue, or false when there is nothing to do.
async function step(): Promise<boolean> {
  const [next] = await db.select().from(getQueue).where(lt(getQueue.attempts, MAX_ATTEMPTS)).orderBy(asc(getQueue.addedAt)).limit(1)
  if (!next) return false
  try {
    const w = await whisparr.getRemote(next.stashdbId)
    if (w.whisparrId) await db.insert(whisparrGets).values({ movieId: w.whisparrId, searchedAt: new Date() }).onConflictDoUpdate({ target: whisparrGets.movieId, set: { searchedAt: new Date() } })
    await db.delete(getQueue).where(eq(getQueue.stashdbId, next.stashdbId))
  } catch (e) {
    await db
      .update(getQueue)
      .set({ attempts: next.attempts + 1, lastError: (e as Error).message.slice(0, 300) })
      .where(eq(getQueue.stashdbId, next.stashdbId))
  }
  return true
}

// Works the queue down, one Get every SPACING. One drain at a time (the job's overlap guard):
// a kick during a drain joins it, and the loop picks up what was added meanwhile.
async function drain() {
  queueStatus.running = true
  try {
    let fetched = 0
    while (await step()) {
      fetched++
      await new Promise((r) => setTimeout(r, SPACING))
    }
    // A Get adds its studio and performers with Whisparr's flags on; turn them off now rather
    // than at the next timed run, which can be an hour away when nobody is using flix.
    if (fetched) kickSync()
  } catch (e) {
    queueStatus.lastError = (e as Error).message
  } finally {
    queueStatus.running = false
  }
}
const kick = () => void drainJob?.trigger()

// Search again the fetched scenes that are still waiting, a few at a time.
export async function researchWaiting(now = Date.now()): Promise<number> {
  if (!config.whisparr) return 0
  const [rows, movies, a] = await Promise.all([db.select().from(whisparrGets), whisparr.movies(), whisparr.activity()])
  const byId = new Map(movies.map((m) => [m.id, m]))
  const due = rows
    .filter((r) => {
      const m = byId.get(r.movieId)
      if (!m || m.hasFile || a.downloading.has(m.id) || a.grabbedAt.has(m.id)) return false
      return now - (r.searchedAt ?? r.at).getTime() >= RESEARCH_AFTER
    })
    .slice(0, RESEARCH_PER_HOUR)
  for (const [i, r] of due.entries()) {
    if (i) await new Promise((res) => setTimeout(res, SPACING))
    try {
      await whisparr.searchScene(r.movieId)
      await db.update(whisparrGets).set({ searchedAt: new Date() }).where(eq(whisparrGets.movieId, r.movieId))
    } catch (e) {
      queueStatus.lastError = (e as Error).message
    }
  }
  return due.length
}

// Pure, for tests: may discovery fetch this StashDB scene? Not one the library has (`owned`),
// one Whisparr holds with a file or monitored (`known`), one deleted before (`excluded`: import
// exclusions, lower-case ids), or one with a blocked performer, studio or category.
export interface DiscoveryContext {
  owned: { has(id: string): boolean }
  known: Set<string>
  excluded: Set<string>
  blocked: StashDbIdSets
}
export function eligible(r: { id: string; performerIds: string[]; studioId: string | null; tags: unknown }, c: DiscoveryContext): boolean {
  return (
    !c.owned.has(r.id) &&
    !c.known.has(r.id) &&
    !c.excluded.has(r.id.toLowerCase()) &&
    !r.performerIds.some((p) => c.blocked.performers.has(p)) &&
    !(r.studioId && c.blocked.studios.has(r.studioId)) &&
    !(r.tags as { name: string }[]).some((t) => c.blocked.tagNames.has(t.name.toLowerCase()))
  )
}

// Find new releases of followed performers and studios and queue them.
export async function discoverNew(now = Date.now()): Promise<number> {
  if (!config.whisparr) return 0
  const [fp, fs, starts, blocked, owned, movies, excluded] = await Promise.all([
    stash.favoritePerformers(),
    stash.favoriteStudios(),
    db.select().from(whisparrWatch),
    blockedStashDbIds(),
    stash.sceneStashIdMap(),
    whisparr.movies(),
    whisparr.exclusionIds(true), // fresh, and no answer stops the run: never fetch a deleted scene
  ])
  const since = new Map(starts.map((r) => [`${r.kind}:${r.foreignId}`, r.since.getTime()]))
  const known = new Set(movies.filter((m) => m.stashId && (m.hasFile || m.monitored)).map((m) => m.stashId!))
  const ctx: DiscoveryContext = { owned, known, excluded, blocked }
  const picked = new Set<string>()
  for (const [kind, favs] of [['performer', fp], ['studio', fs]] as const) {
    for (const f of favs) {
      if (f.stashIds.some((id) => blocked[`${kind}s`].has(id))) continue
      for (const id of f.stashIds) {
        if (!stashdb.isStashDbId(id)) continue // an id from another stash-box: not StashDB's to look up
        const start = since.get(`${kind}:${id}`) ?? now
        if (!since.has(`${kind}:${id}`)) await db.insert(whisparrWatch).values({ kind, foreignId: id, since: new Date(now) }).onConflictDoNothing()
        const after = new Date(start - GRACE).toISOString().slice(0, 10)
        for (const r of await catalog.recentOf(kind, id, after)) if (eligible(r, ctx)) picked.add(r.id)
      }
    }
  }
  const n = await enqueue([...picked])
  queueStatus.lastDiscovery = new Date(now).toISOString()
  queueStatus.lastDiscoveryFound = n
  return n
}

// Scenes fetched and still without a file, newest first, and what is still in the queue.
export async function waiting(): Promise<WaitingScene[]> {
  const [rows, queued, movies, a] = await Promise.all([db.select().from(whisparrGets), db.select().from(getQueue), whisparr.movies(), whisparr.activity()])
  const byId = new Map(movies.map((m) => [m.id, m]))
  const out: WaitingScene[] = []
  const qRows = queued.length ? await db.select().from(sdbScenes).where(or(...queued.map((q) => eq(sdbScenes.id, q.stashdbId)))) : []
  const labelled = await catalog.label(qRows)
  const byStash = new Map(labelled.map((w) => [w.stashdbId, w]))
  for (const q of queued) {
    const w = byStash.get(q.stashdbId) ?? { whisparrId: null, stashdbId: q.stashdbId, title: 'A StashDB scene', date: null, studio: null, performers: [], image: null, runtime: null, state: 'queued' as const }
    out.push({ scene: { ...w, state: 'queued' }, since: q.addedAt.toISOString(), searchedAt: null, error: q.attempts >= MAX_ATTEMPTS ? q.lastError : null })
  }
  for (const r of rows) {
    const m = byId.get(r.movieId)
    if (!m || m.hasFile) continue
    out.push({ scene: whisparr.toWanted(m, a), since: r.at.toISOString(), searchedAt: r.searchedAt?.toISOString() ?? null, error: null })
  }
  return out.sort((x, y) => y.since.localeCompare(x.since))
}

// Give up on a fetched scene: unmonitor it and forget it (it stays in Whisparr's list, unmonitored).
export async function giveUp(movieId: number) {
  await whisparr.setMonitored([movieId], false)
  await db.delete(whisparrGets).where(eq(whisparrGets.movieId, movieId))
}

export async function searchNow(movieId: number) {
  const [r] = await db.select().from(whisparrGets).where(eq(whisparrGets.movieId, movieId))
  if (!r) throw new RangeError('not a scene fetched from flix')
  if (r.searchedAt && Date.now() - r.searchedAt.getTime() < 3_600_000) throw new RangeError('searched less than an hour ago')
  await whisparr.searchScene(movieId)
  await db.update(whisparrGets).set({ searchedAt: new Date() }).where(eq(whisparrGets.movieId, movieId))
}

// Discovery fetches on its own only while the Settings switch is on; "Find new" runs it by hand.
async function daily() {
  await catalog
    .pruneQueries()
    .then((n) => n && console.log(`stashdb: pruned ${n} cached searches unused for 30 days`))
    .catch((e: Error) => console.error('pruning stashdb searches:', e.message))
  try {
    if (!(await getSettings()).whisparrSync) return
    await discoverNew()
  } catch (e) {
    queueStatus.lastError = (e as Error).message
  }
}

// The three timers, only with Whisparr configured. Discovery is daily counted from its last run
// (kept across restarts), not five minutes after every deploy.
const drainJob = config.whisparr ? register({ name: 'get-queue', every: 10 * 60_000, firstAfter: 60_000, run: drain }) : null // a failed attempt is retried later
if (config.whisparr) {
  register({ name: 'get-research', every: 3_600_000, firstAfter: 3_600_000, run: () => researchWaiting().catch((e: Error) => (queueStatus.lastError = e.message)) })
  register({ name: 'discovery', every: DISCOVER_EVERY, firstAfter: 5 * 60_000, persist: true, run: daily })
}

