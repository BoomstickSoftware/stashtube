// The follow sync: Stash favourites are the truth, Whisparr is made to match.
// - A followed performer is monitored in Whisparr for NEW releases only (monitored +
//   whisparrMonitorNewItems; no search, the back catalogue untouched) and tagged `flix`.
// - A performer flix tagged and you no longer follow is unmonitored and untagged.
// - Nothing blocked in flix is monitored: blocked performers and studios are unmonitored even
//   when someone set them by hand in Whisparr.
// - A performer monitored by hand in Whisparr without the tag is reported, never changed.
// Level-triggered: each run reads all three sides and applies the difference, so a run that
// fails is simply repeated by the next one; nothing is queued. A click never waits on Whisparr.
// architecture/whisparr-sync, decisions/whisparr-nothing-monitored.
import type { SyncItem, SyncStatus } from '@flix/shared'
import { db } from './db/index.ts'
import { blocks } from './db/schema.ts'
import { config } from './config.ts'
import { getSettings } from './settings.ts'
import * as stash from './stash.ts'
import * as whisparr from './whisparr.ts'
import type { WPerformer, WStudio } from './whisparr.ts'

export const TAG = 'flix'
// More flag changes than this in one run is not a follow or a block: stop and show the plan.
export const MAX_FLAG_WRITES = 20
// Dropping more than this share of the watched performers at once looks like a wrong answer
// from Stash (a restored database, a different library); stop and show the plan.
export const MAX_DROP_SHARE = 0.5
const EVERY = 15 * 60_000
const FIRST_AFTER = 3 * 60_000
const KICK_AFTER = 10_000

export interface Favourite {
  name: string
  stashIds: string[]
}

export interface Plan {
  monitor: WPerformer[] // followed, not watched yet
  adopt: WPerformer[] // followed and already watched by hand: just tag it
  unmonitor: { p: WPerformer; reason: string }[]
  studios: WStudio[] // blocked studios Whisparr monitors
  missing: Favourite[] // followed, unknown to Whisparr
  unmanaged: WPerformer[] // watched by hand in Whisparr, not followed, not blocked
  managedAfter: number
}

const watched = (x: { monitored: boolean; whisparrMonitorNewItems: boolean }) => x.monitored || x.whisparrMonitorNewItems

// Pure: what has to change. `tagId` null means Whisparr has no `flix` tag yet (nothing managed).
export function planSync(input: {
  favourites: Favourite[]
  blockedPerformers: Set<string> // StashDB ids
  blockedStudios: Set<string>
  performers: WPerformer[]
  studios: WStudio[]
  tagId: number | null
}): Plan {
  const { favourites, blockedPerformers, blockedStudios, performers, studios, tagId } = input
  const tagged = (p: WPerformer) => tagId !== null && p.tags.includes(tagId)
  const byForeign = new Map(performers.map((p) => [p.foreignId, p]))
  const plan: Plan = { monitor: [], adopt: [], unmonitor: [], studios: [], missing: [], unmanaged: [], managedAfter: 0 }
  const desired = new Set<number>()
  for (const f of favourites) {
    if (f.stashIds.some((id) => blockedPerformers.has(id))) continue // blocked wins over followed
    const p = f.stashIds.map((id) => byForeign.get(id)).find(Boolean)
    if (!p) {
      plan.missing.push(f)
      continue
    }
    if (desired.has(p.id)) continue
    desired.add(p.id)
    if (p.monitored && p.whisparrMonitorNewItems) {
      if (!tagged(p)) plan.adopt.push(p)
    } else plan.monitor.push(p)
  }
  for (const p of performers) {
    if (desired.has(p.id)) continue
    const blocked = blockedPerformers.has(p.foreignId)
    if (tagged(p)) plan.unmonitor.push({ p, reason: blocked ? 'blocked in flix' : 'no longer followed' })
    else if (blocked && watched(p)) plan.unmonitor.push({ p, reason: 'blocked in flix (was set in Whisparr by hand)' })
    else if (watched(p)) plan.unmanaged.push(p)
  }
  plan.studios = studios.filter((s) => blockedStudios.has(s.foreignId) && watched(s))
  plan.managedAfter = desired.size
  return plan
}

// Why a plan must not be applied without a person looking, or null.
export function refusal(plan: Plan, managedBefore: number): string | null {
  const flagWrites = plan.monitor.length + plan.unmonitor.length + plan.studios.length
  if (flagWrites > MAX_FLAG_WRITES) return `${flagWrites} monitoring changes at once (limit ${MAX_FLAG_WRITES}); apply them in Whisparr or raise the limit`
  const dropped = plan.unmonitor.filter((u) => u.reason === 'no longer followed').length
  if (managedBefore >= 4 && dropped > managedBefore * MAX_DROP_SHARE)
    return `would stop watching ${dropped} of ${managedBefore} performers at once; Stash may have answered wrongly`
  return null
}

export function itemsOf(plan: Plan): SyncItem[] {
  return [
    ...plan.monitor.map((p) => ({ kind: 'performer' as const, name: p.fullName, action: 'monitor' as const, reason: 'followed in flix' })),
    ...plan.adopt.map((p) => ({ kind: 'performer' as const, name: p.fullName, action: 'adopt' as const, reason: 'followed, already watched in Whisparr' })),
    ...plan.unmonitor.map(({ p, reason }) => ({ kind: 'performer' as const, name: p.fullName, action: 'unmonitor' as const, reason })),
    ...plan.studios.map((s) => ({ kind: 'studio' as const, name: s.title, action: 'unmonitor' as const, reason: 'blocked in flix' })),
    ...plan.missing.map((f) => ({ kind: 'performer' as const, name: f.name, action: 'missing' as const, reason: 'followed, but Whisparr does not know them: add them in Whisparr' })),
    ...plan.unmanaged.map((p) => ({ kind: 'performer' as const, name: p.fullName, action: 'unmanaged' as const, reason: 'monitored in Whisparr by hand, not followed in flix' })),
  ]
}

// ---------- the runner ----------

let status: SyncStatus = { available: false, enabled: false, running: false, lastRun: null, outcome: null, detail: null, items: [], managed: 0 }
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

export function runSync(): Promise<SyncStatus> {
  running ??= run().finally(() => (running = null))
  return running
}

async function run(): Promise<SyncStatus> {
  const enabled = (await getSettings().catch(() => null))?.whisparrSync ?? false
  const done = (outcome: SyncStatus['outcome'], detail: string, items: SyncItem[] = status.items, managed = status.managed) => {
    status = { available: !!config.whisparr, enabled, running: false, lastRun: new Date().toISOString(), outcome, detail, items, managed }
    if (outcome === 'failed' || outcome === 'skipped') console.warn(`sync: ${outcome}: ${detail}`)
    return status
  }
  if (!config.whisparr) return done('skipped', 'Whisparr is not configured', [], 0)

  // Every side must answer; "no answer" is never read as "nothing followed" or "nothing blocked".
  let favourites: Favourite[]
  let rows: { kind: string; stashId: string }[]
  try {
    ;[favourites, rows] = await Promise.all([stash.favoritePerformers(), db.select({ kind: blocks.kind, stashId: blocks.stashId }).from(blocks)])
  } catch (e) {
    return done('skipped', `Stash or Postgres did not answer (${(e as Error).message}); nothing changed`)
  }
  let blockedPerformers: Set<string>, blockedStudios: Set<string>
  try {
    const ids = async (kind: 'performer' | 'studio') => new Set((await Promise.all(rows.filter((r) => r.kind === kind).map((r) => stash.stashIdsOf(kind, r.stashId)))).flat())
    ;[blockedPerformers, blockedStudios] = await Promise.all([ids('performer'), ids('studio')])
  } catch (e) {
    return done('skipped', `Stash did not answer for the blocklist (${(e as Error).message}); nothing changed`)
  }
  let performers: WPerformer[], studios: WStudio[], tags: { id: number; label: string }[]
  try {
    ;[performers, studios, tags] = await Promise.all([whisparr.listPerformers(), whisparr.listStudios(), whisparr.listTags()])
  } catch (e) {
    return done('skipped', `Whisparr did not answer (${(e as Error).message}); nothing changed`)
  }
  let tagId = tags.find((t) => t.label === TAG)?.id ?? null
  tagCache = tagId
  const managedBefore = tagId === null ? 0 : performers.filter((p) => p.tags.includes(tagId as number)).length
  const plan = planSync({ favourites, blockedPerformers, blockedStudios, performers, studios, tagId })
  const items = itemsOf(plan)
  const changes = plan.monitor.length + plan.adopt.length + plan.unmonitor.length + plan.studios.length
  const summary = `${plan.monitor.length} to watch, ${plan.adopt.length} to tag, ${plan.unmonitor.length + plan.studios.length} to unmonitor`
  const why = refusal(plan, managedBefore)
  if (why) return done('skipped', why, items, managedBefore)
  if (!enabled) return done('planned', changes ? `sync is off; it would: ${summary}` : 'sync is off; Whisparr already matches', items, managedBefore)
  if (!changes) return done('applied', 'Whisparr already matches', items, managedBefore)

  try {
    if (tagId === null) tagId = tagCache = (await whisparr.createTag(TAG)).id
  } catch (e) {
    return done('failed', `could not create the "${TAG}" tag in Whisparr (${(e as Error).message})`, items, managedBefore)
  }
  const t = tagId
  const errors = new Map<string, string>()
  const attempt = async (name: string, write: () => Promise<void>) => {
    try {
      await write()
    } catch (e) {
      errors.set(name, (e as Error).message)
    }
  }
  // One at a time: Whisparr runs on a small NAS and each PUT rewrites the whole object.
  for (const p of plan.monitor) await attempt(p.fullName, () => whisparr.patchPerformer(p.id, { monitored: true, whisparrMonitorNewItems: true, tags: [...new Set([...p.tags, t])] }))
  for (const p of plan.adopt) await attempt(p.fullName, () => whisparr.patchPerformer(p.id, { tags: [...new Set([...p.tags, t])] }))
  for (const { p } of plan.unmonitor) await attempt(p.fullName, () => whisparr.patchPerformer(p.id, { monitored: false, whisparrMonitorNewItems: false, tags: p.tags.filter((x) => x !== t) }))
  for (const s of plan.studios) await attempt(s.title, () => whisparr.patchStudio(s.id, { monitored: false, whisparrMonitorNewItems: false }))
  const withErrors = items.map((i) => (errors.has(i.name) ? { ...i, error: errors.get(i.name) } : i))
  return done(errors.size ? 'failed' : 'applied', errors.size ? `${summary}; ${errors.size} failed` : summary, withErrors, plan.managedAfter)
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
