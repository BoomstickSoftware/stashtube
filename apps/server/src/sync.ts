// The Whisparr guard (architecture/whisparr-sync). flix decides what Whisparr fetches; Whisparr
// monitors nothing but the scenes flix fetched.
// - Every performer and studio in Whisparr has `monitored` and `whisparrMonitorNewItems` off
//   (Whisparr turns "new items" on for everything it adds, and copies a monitored performer's
//   flags to the studios and co-performers it adds). Discovery is flix's job: getqueue.ts finds
//   followed ones' new releases in the StashDB mirror and fetches them one at a time.
// - A monitored scene stays monitored only if flix fetched it (`whisparr_gets`) or it is
//   downloading or grabbed; everything else is unmonitored.
// - Follow start dates (`whisparr_watch`) for performers and studios no longer followed are
//   forgotten, unless Stash's answer looks wrong (far fewer follows than before).
// Level-triggered: each run reads every side and applies the difference; a failed run is
// repeated by the next. A click never waits on Whisparr. No search is ever started here.
import type { SyncItem, SyncStatus } from '@flix/shared'
import { and, eq } from 'drizzle-orm'
import { db } from './db/index.ts'
import { blocks, whisparrGets, whisparrWatch } from './db/schema.ts'
import { config } from './config.ts'
import { getSettings } from './settings.ts'
import * as stash from './stash.ts'
import * as whisparr from './whisparr.ts'
import type { Movie, WPerformer, WStudio } from './whisparr.ts'

export const TAG = 'flix' // set by earlier versions of the sync; removed wherever it is found
export const GRACE = 14 * 86_400_000 // a release this much older than the follow start still counts as new
// Following far fewer than this share of before looks like a wrong answer from Stash.
export const MIN_KEEP_SHARE = 0.5
// The timer: a check every TICK; a run when the sync is on and flix was used in the last ACTIVE,
// otherwise once per IDLE_EVERY. Each run downloads Whisparr's lists (/movie alone is ~41 MB), so
// _until 2026-11-09_ the flat 15-minute run, on or off, used or not, pulled ~4 GB a day off the NAS.
const TICK = 15 * 60_000
const ACTIVE = 30 * 60_000
const IDLE_EVERY = 60 * 60_000
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
  off: Entity[] // performers and studios with a flag on (or the old tag)
  scenes: number[] // monitored scenes flix did not fetch and nothing is downloading
  watchEnd: { kind: Kind; foreignId: string }[] // follow starts no longer followed
  getsDone: number[] // fetched scenes whose file has arrived
  followed: number // performer and studio ids followed (Stash favourites minus the blocklist)
}

const key = (kind: Kind, foreignId: string) => `${kind}:${foreignId}`

// Pure: what has to change.
export function planSync(input: {
  favourites: { performer: Favourite[]; studio: Favourite[] }
  blocked: { performer: Set<string>; studio: Set<string> } // StashDB ids
  entities: Entity[]
  movies: Pick<Movie, 'id' | 'monitored' | 'hasFile'>[]
  busy: Set<number> // scenes downloading or grabbed
  gets: Set<number> // scenes flix fetched
  since: Map<string, number> // kind:foreignId -> follow start
  tagId: number | null
}): Plan {
  const { favourites, blocked, entities, movies, busy, gets, since, tagId } = input
  const followed = new Set<string>()
  for (const kind of ['performer', 'studio'] as const)
    for (const f of favourites[kind]) if (!f.stashIds.some((id) => blocked[kind].has(id))) for (const id of f.stashIds) followed.add(key(kind, id))
  const plan: Plan = { off: [], scenes: [], watchEnd: [], getsDone: [], followed: followed.size }
  plan.off = entities.filter((e) => e.monitored || e.whisparrMonitorNewItems || (tagId !== null && e.tags.includes(tagId)))
  for (const m of movies) {
    if (m.hasFile && gets.has(m.id)) plan.getsDone.push(m.id)
    if (m.monitored && !busy.has(m.id) && !gets.has(m.id)) plan.scenes.push(m.id)
  }
  for (const k of since.keys())
    if (!followed.has(k)) {
      const [kind, foreignId] = k.split(/:(.*)/s) as [Kind, string]
      plan.watchEnd.push({ kind, foreignId })
    }
  return plan
}

// Why a plan must not be applied, or null: far fewer follows than recorded looks like Stash
// answering wrongly, and would forget follow start dates.
export function refusal(plan: Plan, recorded: number, force = false): string | null {
  if (!force && recorded >= 4 && plan.followed < recorded * MIN_KEEP_SHARE)
    return `${plan.followed} followed against ${recorded} recorded; Stash may have answered wrongly (run the script with --force if this is right)`
  return null
}

export function itemsOf(plan: Plan): SyncItem[] {
  return plan.off.map((e) => ({ kind: e.kind, name: e.name, action: 'unmonitor' as const, reason: 'flix fetches scenes itself' }))
}

export const summaryOf = (p: Plan) => `${p.off.length} performers or studios to unmonitor, ${p.scenes.length} scenes to unmonitor`

// ---------- the runner ----------

let status: SyncStatus = { available: false, enabled: false, running: false, lastRun: null, outcome: null, detail: null, items: [], managed: 0, scenes: 0, fetched: 0 }
let running: Promise<SyncStatus> | null = null

export async function syncStatus(): Promise<SyncStatus> {
  return { ...status, available: !!config.whisparr, enabled: (await getSettings()).whisparrSync, running: !!running }
}

// A Get from flix: the guard must not unmonitor that scene while it waits for a release.
export async function rememberGet(movieId: number | null) {
  if (movieId) await db.insert(whisparrGets).values({ movieId, searchedAt: new Date() }).onConflictDoNothing()
}

// One run at a time. `apply`: true writes; false only plans; undefined follows the Settings
// switch (the timer).
export function runSync(opts: { apply?: boolean; force?: boolean } = {}): Promise<SyncStatus> {
  running ??= run(opts).finally(() => (running = null))
  return running
}

async function run({ apply, force = false }: { apply?: boolean; force?: boolean }): Promise<SyncStatus> {
  const enabled = (await getSettings().catch(() => null))?.whisparrSync ?? false
  const writing = apply ?? enabled
  const done = (outcome: SyncStatus['outcome'], detail: string, items: SyncItem[] = status.items, managed = status.managed, scenes = 0) => {
    status = { available: !!config.whisparr, enabled, running: false, lastRun: new Date().toISOString(), outcome, detail, items, managed, scenes, fetched: 0 }
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
  let entities: Entity[], movies: Movie[], busy: Set<number>, tagId: number | null
  try {
    whisparr.forgetLists() // plan from what Whisparr holds now, not a cached copy
    const [performers, studios, m, a, t] = await Promise.all([whisparr.listPerformers(), whisparr.listStudios(), whisparr.movies(), whisparr.activity(), whisparr.listTags()])
    entities = [...performers.map(fromPerformer), ...studios.map(fromStudio)]
    movies = m
    busy = new Set([...a.downloading, ...a.grabbedAt.keys()])
    tagId = t.find((x) => x.label === TAG)?.id ?? null
  } catch (e) {
    return done('skipped', `Whisparr did not answer (${(e as Error).message}); nothing changed`)
  }
  const plan = planSync({ favourites, blocked, entities, movies, busy, gets, since, tagId })
  const items = itemsOf(plan)
  const summary = summaryOf(plan)
  const changes = plan.off.length + plan.scenes.length
  const why = refusal(plan, since.size, force)
  if (why) return done('skipped', why, items, plan.followed, plan.scenes.length)
  if (!writing) return done('planned', changes ? `${apply === false ? 'dry run' : 'sync is off'}; it would: ${summary}` : 'Whisparr already matches', items, plan.followed, plan.scenes.length)

  const errors = new Map<string, string>()
  const attempt = async (name: string, write: () => Promise<unknown>) => {
    try {
      await write()
    } catch (e) {
      errors.set(name, (e as Error).message)
    }
  }
  // One at a time: Whisparr runs on a small NAS and each PUT rewrites the whole object.
  for (const e of plan.off) {
    const flags = { monitored: false, whisparrMonitorNewItems: false, tags: e.tags.filter((x) => x !== tagId) }
    await attempt(e.name, () => (e.kind === 'performer' ? whisparr.patchPerformer(e.id, flags) : whisparr.patchStudio(e.id, flags)))
  }
  if (plan.scenes.length) await attempt('scenes', () => whisparr.unmonitorMovies(plan.scenes))
  await attempt('bookkeeping', async () => {
    for (const w of plan.watchEnd) await db.delete(whisparrWatch).where(and(eq(whisparrWatch.kind, w.kind), eq(whisparrWatch.foreignId, w.foreignId)))
    for (const id of plan.getsDone) await db.delete(whisparrGets).where(eq(whisparrGets.movieId, id))
  })
  const withErrors = items.map((i) => (errors.has(i.name) ? { ...i, error: errors.get(i.name) } : i))
  const sceneError = errors.get('scenes')
  const detail = errors.size ? `${summary}; ${errors.size} failed${sceneError ? ` (scenes: ${sceneError})` : ''}` : summary
  return done(errors.size ? 'failed' : 'applied', changes ? detail : 'Whisparr already matches', withErrors, plan.followed, plan.scenes.length)
}

// A follow, a block or a finished run of Gets changed things: run soon, once for a burst, and
// only while the sync is on (off, a run would only plan, and Settings' "Check now" does that).
let kick: ReturnType<typeof setTimeout> | null = null
export function kickSync() {
  if (!config.whisparr) return
  if (kick) clearTimeout(kick)
  kick = setTimeout(() => {
    kick = null
    void getSettings()
      .then((s) => (s.whisparrSync ? runSync() : null))
      .catch(() => {})
  }, KICK_AFTER)
  kick.unref()
}

// Pure, for tests: is a timed run due? Off means never (a manual run from Settings still plans).
export function timedRunDue(o: { enabled: boolean; active: boolean; sinceLast: number }): boolean {
  if (!o.enabled) return false
  return o.active || o.sinceLast >= IDLE_EVERY - TICK / 2
}

let lastTimed = -Infinity
async function tick() {
  const enabled = (await getSettings().catch(() => null))?.whisparrSync ?? false
  const now = Date.now()
  if (!timedRunDue({ enabled, active: stash.activeWithin(ACTIVE), sinceLast: now - lastTimed })) return
  lastTimed = now
  await runSync()
}

export function startSync() {
  if (!config.whisparr) return
  setTimeout(() => {
    tick().catch(() => {})
    setInterval(() => tick().catch(() => {}), TICK).unref()
  }, FIRST_AFTER).unref()
}
