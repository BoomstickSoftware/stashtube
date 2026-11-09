// The StashDB mirror (architecture/stashdb-mirror): what flix has learned from StashDB, kept in
// Postgres so a record is fetched once and asked for again only when stale. Not a copy of
// StashDB: the scenes of what was followed, opened or searched.
// - A performer or studio with at most FULL_SCOPE scenes is copied whole in the background
//   ("complete"), then kept current by asking only for what changed since (UPDATED_AT, newest
//   first, stopping at the first known change). Its pages are then answered locally.
// - Anything else (keywords, categories, big studios, trending) is asked of StashDB once per
//   page and the answer kept QUERY_TTL; every scene it returns is stored.
// - All of it goes through stashdb.ts's single rate-limited queue; background work runs one
//   scope at a time.
import type { DiscoverEntity, DiscoverPage, DiscoverQuery, WantedScene } from '@flix/shared'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from './db/index.ts'
import { blocks, getQueue, sdbEntities, sdbQueries, sdbScenes, sdbScopes } from './db/schema.ts'
import { config } from './config.ts'
import { remoteImageUrl } from './remote.ts'
import { getSettings } from './settings.ts'
import * as stash from './stash.ts'
import * as stashdb from './stashdb.ts'
import type { SdbEntity, SdbSceneFull, SceneSort } from './stashdb.ts'
import * as whisparr from './whisparr.ts'

export const PAGE = 40
export const FULL_SCOPE = 1_500 // scenes: copy a catalogue this size whole; bigger ones are paged on demand
const SCOPE_PAGE = 100
const QUERY_TTL = 24 * 3_600_000
const TRENDING_TTL = 6 * 3_600_000
const SCOPE_FRESH = 20 * 3_600_000 // a complete scope younger than this is not re-checked
const ENTITY_TTL = 7 * 86_400_000
const SEARCH_TTL = 24 * 3_600_000

type SceneRow = typeof sdbScenes.$inferSelect
const SORT: Record<NonNullable<DiscoverQuery['sort']>, SceneSort> = { date: 'DATE', added: 'CREATED_AT', trending: 'TRENDING' }

// ---------- storing ----------

const rowOf = (s: SdbSceneFull) => ({
  id: s.id,
  title: s.title,
  date: s.release_date ? s.release_date.slice(0, 10) : null,
  duration: s.duration,
  studioId: s.studio?.id ?? null,
  studioName: s.studio?.name ?? null,
  performers: s.performers.map((p) => ({ id: p.performer.id, name: p.performer.name, as: p.as })),
  performerIds: s.performers.map((p) => p.performer.id),
  tags: s.tags.map((t) => ({ id: t.id, name: t.name })),
  tagIds: s.tags.map((t) => t.id),
  image: stashdb.widestImage(s.images),
  code: s.code,
  created: s.created,
  updated: s.updated,
  fetchedAt: new Date(),
})

export async function storeScenes(scenes: SdbSceneFull[]) {
  if (!scenes.length) return
  const rows = scenes.map(rowOf)
  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(sdbScenes)
      .values(rows.slice(i, i + 200))
      .onConflictDoUpdate({
        target: sdbScenes.id,
        set: {
          title: sql`excluded.title`,
          date: sql`excluded.date`,
          duration: sql`excluded.duration`,
          studioId: sql`excluded.studio_id`,
          studioName: sql`excluded.studio_name`,
          performers: sql`excluded.performers`,
          performerIds: sql`excluded.performer_ids`,
          tags: sql`excluded.tags`,
          tagIds: sql`excluded.tag_ids`,
          image: sql`excluded.image`,
          code: sql`excluded.code`,
          created: sql`excluded.created`,
          updated: sql`excluded.updated`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      })
  }
  // The names a filter chip needs, learned for free; a fuller record (image, count) wins.
  const names: (typeof sdbEntities.$inferInsert)[] = []
  for (const s of scenes) {
    if (s.studio) names.push({ kind: 'studio', id: s.studio.id, name: s.studio.name })
    for (const p of s.performers) names.push({ kind: 'performer', id: p.performer.id, name: p.performer.name, disambiguation: p.performer.disambiguation })
    for (const t of s.tags) names.push({ kind: 'tag', id: t.id, name: t.name })
  }
  const unique = [...new Map(names.map((n) => [`${n.kind}:${n.id}`, n])).values()]
  for (let i = 0; i < unique.length; i += 500) await db.insert(sdbEntities).values(unique.slice(i, i + 500)).onConflictDoNothing()
}

async function storeEntities(es: SdbEntity[]) {
  if (!es.length) return
  await db
    .insert(sdbEntities)
    .values(es.map((e) => ({ ...e, fetchedAt: new Date() })))
    .onConflictDoUpdate({
      target: [sdbEntities.kind, sdbEntities.id],
      set: { name: sql`excluded.name`, disambiguation: sql`excluded.disambiguation`, image: sql`excluded.image`, parentId: sql`excluded.parent_id`, parentName: sql`excluded.parent_name`, sceneCount: sql`excluded.scene_count`, fetchedAt: sql`excluded.fetched_at` },
    })
}

// ---------- scopes: a performer's or studio's whole catalogue ----------

type ScopeKind = 'performer' | 'studio'
const scopeKey = (kind: ScopeKind, id: string) => `${kind}:${id}`
const scopeQuery = (kind: ScopeKind, id: string) => (kind === 'performer' ? { performers: [id] } : { studios: [id] })

const pending = new Set<string>()
let worker: Promise<void> = Promise.resolve()

// Copy (or bring up to date) one scope in the background, one scope at a time. Returns at once.
export function syncScope(kind: ScopeKind, id: string) {
  const key = scopeKey(kind, id)
  if (pending.has(key) || !stashdb.isStashDbId(id)) return
  pending.add(key)
  worker = worker
    .then(() => fillScope(kind, id))
    .catch((e: Error) => console.warn(`catalog: ${key}: ${e.message}`))
    .finally(() => pending.delete(key))
}

export async function fillScope(kind: ScopeKind, id: string) {
  const key = scopeKey(kind, id)
  const [scope] = await db.select().from(sdbScopes).where(eq(sdbScopes.key, key))
  if (scope?.complete && scope.syncedAt && Date.now() - scope.syncedAt.getTime() < SCOPE_FRESH) return
  if (scope?.complete && scope.newestUpdated) {
    // Up to date but for what changed: newest changes first, until one already known.
    let newest = scope.newestUpdated
    for (let page = 1; page <= 20; page++) {
      const { scenes, count } = await stashdb.queryScenes({ ...scopeQuery(kind, id), sort: 'UPDATED_AT', page, perPage: SCOPE_PAGE })
      const fresh = scenes.filter((s) => (s.updated ?? '') > scope.newestUpdated!)
      await storeScenes(fresh)
      for (const s of fresh) if ((s.updated ?? '') > newest) newest = s.updated!
      if (fresh.length < scenes.length || page * SCOPE_PAGE >= count) {
        await db.update(sdbScopes).set({ total: count, newestUpdated: newest, syncedAt: new Date() }).where(eq(sdbScopes.key, key))
        return
      }
    }
    return
  }
  // Not held yet: copy it whole when small enough.
  const first = await stashdb.queryScenes({ ...scopeQuery(kind, id), sort: 'UPDATED_AT', page: 1, perPage: SCOPE_PAGE })
  await storeScenes(first.scenes)
  if (first.count > FULL_SCOPE) {
    await db.insert(sdbScopes).values({ key, total: first.count, complete: false, syncedAt: new Date() }).onConflictDoUpdate({ target: sdbScopes.key, set: { total: first.count, syncedAt: new Date() } })
    return
  }
  let newest = first.scenes[0]?.updated ?? null
  for (let page = 2; (page - 1) * SCOPE_PAGE < first.count; page++) {
    const { scenes } = await stashdb.queryScenes({ ...scopeQuery(kind, id), sort: 'UPDATED_AT', page, perPage: SCOPE_PAGE })
    await storeScenes(scenes)
    if (!scenes.length) break
  }
  newest ??= null
  await db
    .insert(sdbScopes)
    .values({ key, total: first.count, complete: true, newestUpdated: newest, syncedAt: new Date() })
    .onConflictDoUpdate({ target: sdbScopes.key, set: { total: first.count, complete: true, newestUpdated: newest, syncedAt: new Date() } })
}

async function completeScope(q: DiscoverQuery): Promise<boolean> {
  const keys = [...(q.performers ?? []).map((id) => scopeKey('performer', id)), ...((q.studios ?? []).length === 1 ? [scopeKey('studio', q.studios![0])] : [])]
  if (!keys.length) return false
  const rows = await db.select().from(sdbScopes).where(inArray(sdbScopes.key, keys))
  return rows.some((r) => r.complete)
}

// ---------- answering ----------

async function fromMirror(q: DiscoverQuery, page: number): Promise<{ rows: SceneRow[]; count: number }> {
  const where = [
    ...(q.performers?.length ? [sql`${sdbScenes.performerIds} @> ${sql.raw(`ARRAY[${q.performers.map((p) => `'${p}'`).join(',')}]::text[]`)}`] : []),
    ...(q.tags?.length ? [sql`${sdbScenes.tagIds} @> ${sql.raw(`ARRAY[${q.tags.map((p) => `'${p}'`).join(',')}]::text[]`)}`] : []),
    ...(q.studios?.length ? [inArray(sdbScenes.studioId, q.studios)] : []),
  ]
  const cond = where.length ? and(...where) : undefined
  const order = q.sort === 'added' ? [desc(sdbScenes.created)] : [sql`${sdbScenes.date} desc nulls last`, desc(sdbScenes.created)]
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(sdbScenes).where(cond).orderBy(...order).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ n: sql<number>`count(*)::int` }).from(sdbScenes).where(cond),
  ])
  return { rows, count: n }
}

async function fromStashDb(q: DiscoverQuery, page: number): Promise<{ rows: SceneRow[]; count: number }> {
  const sort = SORT[q.sort ?? 'date']
  const input = stashdb.sceneInput({ text: q.q, performers: q.performers, studios: q.studios, tags: q.tags, sort, page, perPage: PAGE })
  const key = JSON.stringify(input)
  const ttl = sort === 'TRENDING' ? TRENDING_TTL : QUERY_TTL
  const [hit] = await db.select().from(sdbQueries).where(eq(sdbQueries.key, key))
  let ids: string[], count: number
  if (hit && Date.now() - hit.fetchedAt.getTime() < ttl) {
    ids = hit.ids
    count = hit.count
  } else {
    const r = await stashdb.queryScenes({ text: q.q, performers: q.performers, studios: q.studios, tags: q.tags, sort, page, perPage: PAGE })
    await storeScenes(r.scenes)
    ids = r.scenes.map((s) => s.id)
    count = r.count
    await db.insert(sdbQueries).values({ key, ids, count }).onConflictDoUpdate({ target: sdbQueries.key, set: { ids, count, fetchedAt: new Date() } })
  }
  const rows = ids.length ? await db.select().from(sdbScenes).where(inArray(sdbScenes.id, ids)) : []
  const byId = new Map(rows.map((r) => [r.id, r]))
  return { rows: ids.map((id) => byId.get(id)).filter((r): r is SceneRow => !!r), count }
}

// What the blocklist hides here: blocked performers and studios by their StashDB ids, blocked
// categories by name (Stash's tags carry no StashDB id).
async function blockedSets() {
  const rows = await db.select().from(blocks)
  const ids = async (kind: 'performer' | 'studio') => new Set((await Promise.all(rows.filter((r) => r.kind === kind).map((r) => stash.stashIdsOf(kind, r.stashId)))).flat())
  return { performers: await ids('performer'), studios: await ids('studio'), tagNames: new Set(rows.filter((r) => r.kind === 'tag').map((r) => r.name.toLowerCase())) }
}

// Each scene as a card: owned (in Stash), what Whisparr is doing with it, or queued here; one
// deleted before (an import exclusion) is marked, and a Get by hand may still fetch it.
export async function label(rows: SceneRow[]): Promise<WantedScene[]> {
  const [owned, movies, a, excluded, queued] = await Promise.all([
    stash.sceneStashIdMap(),
    config.whisparr ? whisparr.movies() : Promise.resolve([]),
    config.whisparr ? whisparr.activity() : Promise.resolve(null),
    config.whisparr ? whisparr.exclusionIds().catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
    db.select({ id: getQueue.stashdbId }).from(getQueue),
  ])
  const byStash = new Map(movies.filter((m) => m.stashId).map((m) => [m.stashId!, m]))
  const inQueue = new Set(queued.map((r) => r.id))
  return rows.map((r) => {
    const base: WantedScene = {
      whisparrId: null,
      stashdbId: r.id,
      title: r.title || 'Untitled',
      date: r.date,
      studio: r.studioName,
      performers: (r.performers as { name: string; as: string | null }[]).map((p) => p.as || p.name),
      image: remoteImageUrl(r.image),
      runtime: r.duration ? Math.round(r.duration / 60) : null,
      state: 'remote',
      ...(excluded.has(r.id.toLowerCase()) ? { deletedBefore: true } : {}),
    }
    const sceneId = owned.get(r.id)
    if (sceneId) return { ...base, state: 'owned', sceneId }
    const m = byStash.get(r.id)
    if (m && a) return { ...base, whisparrId: m.id, state: whisparr.stateOf(m, a) }
    if (inQueue.has(r.id)) return { ...base, state: 'queued' }
    return base
  })
}

async function libraryId(kind: DiscoverEntity['kind'], id: string): Promise<string | null> {
  return stash.libraryIdForStashId(kind, id).catch(() => null)
}

export async function entity(kind: DiscoverEntity['kind'], id: string): Promise<DiscoverEntity | null> {
  if (!stashdb.isStashDbId(id)) return null
  let [row] = await db.select().from(sdbEntities).where(and(eq(sdbEntities.kind, kind), eq(sdbEntities.id, id)))
  // A name learned from a scene has no picture or count yet: ask once, then keep a week.
  const thin = !row || (kind !== 'tag' && !row.image && row.sceneCount === null)
  if (thin || Date.now() - row.fetchedAt.getTime() > ENTITY_TTL) {
    const e = await stashdb.findEntity(kind, id).catch(() => null)
    if (e) {
      await storeEntities([e])
      ;[row] = await db.select().from(sdbEntities).where(and(eq(sdbEntities.kind, kind), eq(sdbEntities.id, id)))
    }
  }
  if (!row) return null
  return { kind, id, name: row.name, disambiguation: row.disambiguation, image: remoteImageUrl(row.image), parent: row.parentName, sceneCount: row.sceneCount, libraryId: await libraryId(kind, id) }
}

// One page of Discover. The mirror answers when it holds a complete scope that the filters fall
// inside (and no keywords); otherwise StashDB is asked, once per page per QUERY_TTL.
export async function discover(input: DiscoverQuery): Promise<DiscoverPage> {
  // Only well-formed StashDB ids go further (the mirror's array filters are built from them).
  const ok = (xs?: string[]) => (xs ?? []).filter(stashdb.isStashDbId).slice(0, 10)
  const q: DiscoverQuery = { ...input, q: input.q?.trim().slice(0, 100) || undefined, performers: ok(input.performers), studios: ok(input.studios), tags: ok(input.tags) }
  const page = Math.max(1, q.page ?? 1)
  const one = !q.q && (q.performers?.length ?? 0) + (q.studios?.length ?? 0) === 1 && !(q.tags?.length)
  if (one) {
    // Opening one performer or studio: copy its catalogue in the background for next time.
    if (q.performers?.length) syncScope('performer', q.performers[0])
    else syncScope('studio', q.studios![0])
  }
  const local = !q.q && q.sort !== 'trending' && (await completeScope(q))
  const { rows, count } = local ? await fromMirror(q, page) : await fromStashDb(q, page)
  const blocked = q.unblocked ? null : await blockedSets()
  const notBlocked = blocked
    ? rows.filter(
        (r) =>
          !(r.studioId && blocked.studios.has(r.studioId)) &&
          !r.performerIds.some((p) => blocked.performers.has(p)) &&
          !(r.tags as { name: string }[]).some((t) => blocked.tagNames.has(t.name.toLowerCase())),
      )
    : rows
  // VR left out unless Settings says otherwise; "Show blocked" brings it back with the rest
  const hideVr = !q.unblocked && (await getSettings()).hideVr
  const visible = hideVr ? notBlocked.filter((r) => !isVrScene(r)) : notBlocked
  const selectedIds: [DiscoverEntity['kind'], string][] = [
    ...(q.performers ?? []).map((id): [DiscoverEntity['kind'], string] => ['performer', id]),
    ...(q.studios ?? []).map((id): [DiscoverEntity['kind'], string] => ['studio', id]),
    ...(q.tags ?? []).map((id): [DiscoverEntity['kind'], string] => ['tag', id]),
  ]
  const selected = (await Promise.all(selectedIds.map(([k, id]) => entity(k, id)))).filter((e): e is DiscoverEntity => !!e)
  const labelled = await label(visible)
  // "Not in motion": only what is on StashDB alone or in Whisparr untouched
  const items = q.fresh ? labelled.filter((w) => NOT_IN_MOTION.has(w.state)) : labelled
  return {
    items,
    count,
    page,
    hasMore: page * PAGE < count,
    source: local ? 'mirror' : 'stashdb',
    selected,
    hidden: rows.length - notBlocked.length,
    vr: notBlocked.length - visible.length,
    inMotion: labelled.length - items.length,
  }
}

// The states Discover's "Not in motion" keeps: not in Whisparr, or there but never requested.
// Everything else is owned or on its way (requested, queued, waiting, grabbed, downloading,
// downloaded).
const NOT_IN_MOTION = new Set<WantedScene['state']>(['remote', 'available'])

// Is this StashDB scene VR? Any of: the title or a category says so ([VR], (VR), the word VR,
// Virtual Reality, 180° or 360°), or the studio's name carries VR in capitals (how VR studios
// brand themselves; capitals so a name merely containing the letters does not match) or starts
// with "Virtual". Discover leaves these out when Settings hideVr is on.
const VR_TEXT = /\bVR\b|virtual[\s-]*reality|\b(180|360)\s*(°|degrees?\b|vr\b)/i
const VR_STUDIO = /VR/ // case-sensitive on purpose
const VIRTUAL_STUDIO = /^virtual/i
export function isVrScene(r: { title: string | null; studioName: string | null; tags: unknown }): boolean {
  return (
    VR_TEXT.test(r.title ?? '') ||
    (r.tags as { name: string }[]).some((t) => VR_TEXT.test(t.name)) ||
    (!!r.studioName && (VR_STUDIO.test(r.studioName) || VIRTUAL_STUDIO.test(r.studioName)))
  )
}

// The filter pickers: StashDB's name search, kept a day per (kind, term).
export async function searchNames(kind: DiscoverEntity['kind'], term: string): Promise<DiscoverEntity[]> {
  const t = term.trim().toLowerCase()
  if (t.length < 2) return []
  const found = await stash.dataCache.get(`sdb-search:${kind}:${t}`, SEARCH_TTL, ['stashdb'], async () => {
    const es = await stashdb.searchEntities(kind, t)
    await storeEntities(es)
    return es
  })
  return found.map((e) => ({ kind: e.kind, id: e.id, name: e.name, disambiguation: e.disambiguation, image: remoteImageUrl(e.image), parent: e.parentName, sceneCount: e.sceneCount, libraryId: null }))
}

// A followed performer's or studio's scenes released on or after `since` (YYYY-MM-DD), newest
// first: one or two StashDB pages a day, or the mirror when it holds the scope.
export async function recentOf(kind: ScopeKind, id: string, since: string): Promise<SceneRow[]> {
  const q: DiscoverQuery = kind === 'performer' ? { performers: [id] } : { studios: [id] }
  const out: SceneRow[] = []
  for (let page = 1; page <= 5; page++) {
    const { rows, count } = (await completeScope(q)) ? await fromMirror(q, page) : await fromStashDb(q, page)
    out.push(...rows.filter((r) => (r.date ?? '') >= since))
    if (rows.some((r) => r.date && r.date < since) || page * PAGE >= count) break
  }
  return out
}
