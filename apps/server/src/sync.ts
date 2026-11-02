// The Whisparr sync: Stash favourites decide everything Whisparr monitors.
// - Followed performers and studios (Stash favourites, minus the blocklist) are watched for new
//   releases: `monitored` + `whisparrMonitorNewItems` on, tagged `flix`. No search, ever.
// - Every other performer and studio has both flags off. Whisparr turns "new items" on for
//   everything it adds, and refreshing a watched performer adds their studios and co-performers
//   with that performer's flags and tags; the sync turns all of those off again.
// - Scenes: Whisparr's "new items" also monitors OLD scenes it learns about later (a newly
//   watched studio's whole catalogue). So a monitored scene stays monitored only if it is a
//   Get from flix, is downloading or grabbed, or belongs to a watched performer or studio and
//   came out after that one's watch started (less GRACE). Everything else is unmonitored.
// Level-triggered: each run reads every side and applies the difference; a failed run is
// repeated by the next. A click never waits on Whisparr. architecture/whisparr-sync.
import type { SyncItem, SyncStatus } from '@flix/shared'
import { and, eq } from 'drizzle-orm'
import { db } from './db/index.ts'
import { blocks, whisparrGets, whisparrWatch } from './db/schema.ts'
import { config } from './config.ts'
import { getSettings } from './settings.ts'
import * as stash from './stash.ts'
import * as whisparr from './whisparr.ts'
import type { Movie, WPerformer, WStudio } from './whisparr.ts'

export const TAG = 'flix'
export const GRACE = 14 * 86_400_000 // a release this much older than the watch start still counts as new
// The timer's runs (not one you ask for): turning on more than this many at once is not a
// follow, so it waits for a person.
export const MAX_TURN_ON = 20
// Watching fewer than this share of what was watched looks like a wrong answer from Stash.
export const MIN_KEEP_SHARE = 0.5
const EVERY = 15 * 60_000
const FIRST_AFTER = 3 * 60_000
const KICK_AFTER = 10_000

export type Kind = 'performer' | 'studio'
export interface Favourite {
  name: string
  stashIds: string[]
}
export interface Entity {
  kind: Kind
  id: number
  name: string
  foreignId: string
  monitored: boolean
  whisparrMonitorNewItems: boolean
  tags: number[]
}
export const fromPerformer = (p: WPerformer): Entity => ({ kind: 'performer', id: p.id, name: p.fullName, foreignId: p.foreignId, monitored: p.monitored, whisparrMonitorNewItems: p.whisparrMonitorNewItems, tags: p.tags })
export const fromStudio = (s: WStudio): Entity => ({ kind: 'studio', id: s.id, name: s.title, foreignId: s.foreignId, monitored: s.monitored, whisparrMonitorNewItems: s.whisparrMonitorNewItems, tags: s.tags })

export interface Plan {
  on: Entity[] // followed, not watched yet
  adopt: Entity[] // followed and watched already: only the tag is missing
  off: { e: Entity; reason: string }[] // watched (or tagged) and not followed, or blocked
  missing: (Favourite & { kind: Kind })[] // followed, unknown to Whisparr
  scenes: number[] // monitored scenes to unmonitor
  sceneReasons: Record<string, number>
  watchStart: { kind: Kind; foreignId: string }[] // newly watched: record the start
  watchEnd: { kind: Kind; foreignId: string }[] // no longer watched: forget the start
  getsDone: number[] // Gets whose file has arrived
  watched: number // performers + studios watched after the plan
}

const watchedFully = (e: Entity) => e.monitored && e.whisparrMonitorNewItems
const key = (kind: Kind, foreignId: string) => `${kind}:${foreignId}`

// Pure: what has to change.
export function planSync(input: {
  favourites: { performer: Favourite[]; studio: Favourite[] }
  blocked: { performer: Set<string>; studio: Set<string> } // StashDB ids
  entities: Entity[] // Whisparr's performers and studios
  movies: Pick<Movie, 'id' | 'monitored' | 'hasFile' | 'releaseDate' | 'performerForeignIds' | 'studioForeignId'>[]
  busy: Set<number> // scenes downloading or grabbed
  gets: Set<number> // scenes fetched with Get
  since: Map<string, number> // kind:foreignId -> ms the watch started
  tagId: number | null
  now: number
}): Plan {
  const { favourites, blocked, entities, movies, busy, gets, since, tagId, now } = input
  const tagged = (e: Entity) => tagId !== null && e.tags.includes(tagId)
  const plan: Plan = { on: [], adopt: [], off: [], missing: [], scenes: [], sceneReasons: {}, watchStart: [], watchEnd: [], getsDone: [], watched: 0 }
  const desired = new Map<string, Entity>() // key -> entity
  for (const kind of ['performer', 'studio'] as const) {
    const byForeign = new Map(entities.filter((e) => e.kind === kind).map((e) => [e.foreignId, e]))
    for (const f of favourites[kind]) {
      if (f.stashIds.some((id) => blocked[kind].has(id))) continue // blocked wins over followed
      const e = f.stashIds.map((id) => byForeign.get(id)).find(Boolean)
      if (!e) {
        plan.missing.push({ ...f, kind })
        continue
      }
      const k = key(kind, e.foreignId)
      if (desired.has(k)) continue
      desired.set(k, e)
      if (!watchedFully(e)) plan.on.push(e)
      else if (!tagged(e)) plan.adopt.push(e)
      if (!since.has(k)) plan.watchStart.push({ kind, foreignId: e.foreignId })
    }
  }
  for (const e of entities) {
    if (desired.has(key(e.kind, e.foreignId))) continue
    if (e.monitored || e.whisparrMonitorNewItems || tagged(e))
      plan.off.push({ e, reason: blocked[e.kind].has(e.foreignId) ? 'blocked in flix' : tagged(e) ? 'no longer followed' : 'not followed in flix' })
  }
  for (const k of since.keys()) if (!desired.has(k)) {
    const [kind, foreignId] = k.split(/:(.*)/s) as [Kind, string]
    plan.watchEnd.push({ kind, foreignId })
  }
  // A watched one's start: recorded, or now for one the plan starts watching.
  const startOf = (kind: Kind, foreignId: string): number | null => (desired.has(key(kind, foreignId)) ? (since.get(key(kind, foreignId)) ?? now) : null)
  const count = (r: string) => (plan.sceneReasons[r] = (plan.sceneReasons[r] ?? 0) + 1)
  for (const m of movies) {
    if (m.hasFile && gets.has(m.id)) plan.getsDone.push(m.id)
    if (!m.monitored || busy.has(m.id) || gets.has(m.id)) continue
    const released = m.releaseDate ? Date.parse(m.releaseDate) : NaN
    const starts = [...(m.performerForeignIds ?? []).map((f) => startOf('performer', f)), m.studioForeignId ? startOf('studio', m.studioForeignId) : null].filter((x): x is number => x !== null)
    if (!starts.length) {
      plan.scenes.push(m.id)
      count('not from a followed performer or studio')
    } else if (!(released >= Math.min(...starts) - GRACE)) {
      plan.scenes.push(m.id)
      count('released before the watch started')
    }
  }
  plan.watched = desired.size
  return plan
}

// Why a plan must not be applied, or null. `asked`: a person ran it (the script), not the timer.
export function refusal(plan: Plan, watchedBefore: number, asked: boolean, force = false): string | null {
  if (!force && watchedBefore >= 4 && plan.watched < watchedBefore * MIN_KEEP_SHARE)
    return `would watch ${plan.watched} instead of ${watchedBefore}; Stash may have answered wrongly (run the script with --force if this is right)`
  if (!asked && plan.on.length > MAX_TURN_ON) return `${plan.on.length} to start watching at once (limit ${MAX_TURN_ON} for the timer); run scripts/whisparr-sync.mjs --apply`
  return null
}

export function itemsOf(plan: Plan): SyncItem[] {
  return [
    ...plan.on.map((e) => ({ kind: e.kind, name: e.name, action: 'monitor' as const, reason: 'followed in flix' })),
    ...plan.adopt.map((e) => ({ kind: e.kind, name: e.name, action: 'adopt' as const, reason: 'followed, already watched in Whisparr' })),
    ...plan.off.map(({ e, reason }) => ({ kind: e.kind, name: e.name, action: 'unmonitor' as const, reason })),
    ...plan.missing.map((f) => ({ kind: f.kind, name: f.name, action: 'missing' as const, reason: 'followed, but Whisparr does not know it: add it in Whisparr' })),
  ]
}

export const summaryOf = (p: Plan) =>
  `${p.on.length} to watch, ${p.adopt.length} to tag, ${p.off.length} performers or studios to unmonitor, ${p.scenes.length} scenes to unmonitor`

// ---------- the runner ----------

let status: SyncStatus = { available: false, enabled: false, running: false, lastRun: null, outcome: null, detail: null, items: [], managed: 0, scenes: 0 }
let running: Promise<SyncStatus> | null = null
let tagCache: number | null = null

export async function syncStatus(): Promise<SyncStatus> {
  return { ...status, available: !!config.whisparr, enabled: (await getSettings()).whisparrSync, running: !!running }
}

// The `flix` tag's id, if Whisparr has it (for the performer page's "managed").
export async function flixTagId(): Promise<number | null> {
  if (tagCache !== null || !config.whisparr) return tagCache
  tagCache = (await whisparr.listTags()).find((t) => t.label === TAG)?.id ?? null
  return tagCache
}

// A Get from flix: the sync must not unmonitor that scene while it waits for a release.
export async function rememberGet(movieId: number | null) {
  if (movieId) await db.insert(whisparrGets).values({ movieId }).onConflictDoNothing()
}

// One run at a time. `apply`: true writes; false only plans; undefined follows the Settings
// switch (the timer). `asked`: a person asked (the script), so the timer's size limit is off.
export function runSync(opts: { apply?: boolean; asked?: boolean; force?: boolean } = {}): Promise<SyncStatus> {
  running ??= run(opts).finally(() => (running = null))
  return running
}

async function run({ apply, asked = false, force = false }: { apply?: boolean; asked?: boolean; force?: boolean }): Promise<SyncStatus> {
  const enabled = (await getSettings().catch(() => null))?.whisparrSync ?? false
  const writing = apply ?? enabled
  const done = (outcome: SyncStatus['outcome'], detail: string, items: SyncItem[] = status.items, managed = status.managed, scenes = 0) => {
    status = { available: !!config.whisparr, enabled, running: false, lastRun: new Date().toISOString(), outcome, detail, items, managed, scenes }
    if (outcome === 'failed' || outcome === 'skipped') console.warn(`sync: ${outcome}: ${detail}`)
    return status
  }
  if (!config.whisparr) return done('skipped', 'Whisparr is not configured', [], 0)

  // Every side must answer; "no answer" is never read as "nothing followed" or "nothing blocked".
  let favourites: { performer: Favourite[]; studio: Favourite[] }
  let blocked: { performer: Set<string>; studio: Set<string> }
  let gets: Set<number>, since: Map<string, number>
  try {
    const [fp, fs, rows, g, w] = await Promise.all([
      stash.favoritePerformers(),
      stash.favoriteStudios(),
      db.select({ kind: blocks.kind, stashId: blocks.stashId }).from(blocks),
      db.select().from(whisparrGets),
      db.select().from(whisparrWatch),
    ])
    favourites = { performer: fp, studio: fs }
    const ids = async (kind: Kind) => new Set((await Promise.all(rows.filter((r) => r.kind === kind).map((r) => stash.stashIdsOf(kind, r.stashId)))).flat())
    blocked = { performer: await ids('performer'), studio: await ids('studio') }
    gets = new Set(g.map((r) => r.movieId))
    since = new Map(w.map((r) => [key(r.kind as Kind, r.foreignId), r.since.getTime()]))
  } catch (e) {
    return done('skipped', `Stash or Postgres did not answer (${(e as Error).message}); nothing changed`)
  }
  let entities: Entity[], movies: Movie[], busy: Set<number>, tags: { id: number; label: string }[]
  try {
    whisparr.forgetLists() // plan from what Whisparr holds now, not a cached copy
    const [performers, studios, m, a, t] = await Promise.all([whisparr.listPerformers(), whisparr.listStudios(), whisparr.movies(), whisparr.activity(), whisparr.listTags()])
    entities = [...performers.map(fromPerformer), ...studios.map(fromStudio)]
    movies = m
    busy = new Set([...a.downloading, ...a.grabbedAt.keys()])
    tags = t
  } catch (e) {
    return done('skipped', `Whisparr did not answer (${(e as Error).message}); nothing changed`)
  }
  let tagId = tags.find((t) => t.label === TAG)?.id ?? null
  tagCache = tagId
  // What flix itself started watching (its own rows), not what carries the tag: refreshing a
  // watched performer, Whisparr adds their studios and co-performers with the same flags AND
  // tags (2026-11-02: 43 followed became 149 tagged in one run), so the tag over-counts.
  const watchedBefore = since.size
  const plan = planSync({ favourites, blocked, entities, movies, busy, gets, since, tagId, now: Date.now() })
  const items = itemsOf(plan)
  const summary = summaryOf(plan)
  const changes = plan.on.length + plan.adopt.length + plan.off.length + plan.scenes.length
  const why = refusal(plan, watchedBefore, asked, force)
  if (why) return done('skipped', why, items, watchedBefore, plan.scenes.length)
  if (!writing) return done('planned', changes ? `${apply === false ? 'dry run' : 'sync is off'}; it would: ${summary}` : 'Whisparr already matches', items, watchedBefore, plan.scenes.length)

  try {
    if (tagId === null) tagId = tagCache = (await whisparr.createTag(TAG)).id
    // Record watch starts before anything is turned on, so the next run trims by them.
    if (plan.watchStart.length) await db.insert(whisparrWatch).values(plan.watchStart).onConflictDoNothing()
  } catch (e) {
    return done('failed', `could not prepare (${(e as Error).message}); nothing changed`, items, watchedBefore)
  }
  const t = tagId
  const errors = new Map<string, string>()
  const attempt = async (name: string, write: () => Promise<unknown>) => {
    try {
      await write()
    } catch (e) {
      errors.set(name, (e as Error).message)
    }
  }
  const patch = (e: Entity, flags: { monitored?: boolean; whisparrMonitorNewItems?: boolean; tags: number[] }) =>
    e.kind === 'performer' ? whisparr.patchPerformer(e.id, flags) : whisparr.patchStudio(e.id, flags)
  // One at a time: Whisparr runs on a small NAS and each PUT rewrites the whole object. Off
  // first, so a failure later leaves less monitored rather than more.
  for (const { e } of plan.off) await attempt(e.name, () => patch(e, { monitored: false, whisparrMonitorNewItems: false, tags: e.tags.filter((x) => x !== t) }))
  if (plan.scenes.length) await attempt('scenes', () => whisparr.unmonitorMovies(plan.scenes))
  for (const e of plan.on) await attempt(e.name, () => patch(e, { monitored: true, whisparrMonitorNewItems: true, tags: [...new Set([...e.tags, t])] }))
  for (const e of plan.adopt) await attempt(e.name, () => patch(e, { tags: [...new Set([...e.tags, t])] }))
  await attempt('bookkeeping', async () => {
    for (const w of plan.watchEnd) await db.delete(whisparrWatch).where(and(eq(whisparrWatch.kind, w.kind), eq(whisparrWatch.foreignId, w.foreignId)))
    for (const id of plan.getsDone) await db.delete(whisparrGets).where(eq(whisparrGets.movieId, id))
  })
  const withErrors = items.map((i) => (errors.has(i.name) ? { ...i, error: errors.get(i.name) } : i))
  const sceneError = errors.get('scenes')
  const detail = errors.size ? `${summary}; ${errors.size} failed${sceneError ? ` (scenes: ${sceneError})` : ''}` : summary
  return done(errors.size ? 'failed' : 'applied', changes ? detail : 'Whisparr already matches', withErrors, plan.watched, plan.scenes.length)
}

// A follow or a block changed what Whisparr should do: run soon, once for a burst of clicks.
let kick: ReturnType<typeof setTimeout> | null = null
export function kickSync() {
  if (!config.whisparr) return
  if (kick) clearTimeout(kick)
  kick = setTimeout(() => {
    kick = null
    runSync().catch(() => {})
  }, KICK_AFTER)
  kick.unref()
}

export function startSync() {
  if (!config.whisparr) return
  setTimeout(() => {
    runSync().catch(() => {})
    setInterval(() => runSync().catch(() => {}), EVERY).unref()
  }, FIRST_AFTER).unref()
}
