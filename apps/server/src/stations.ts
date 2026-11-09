import type { SavedStation, SceneQuery, StationInput, StationMode, StationPreview, StationPreviews, StationResume } from '@flix/shared'
import { and, asc, desc, eq, inArray, notInArray, notLike, sql } from 'drizzle-orm'
import { exclusions } from './blocklist.ts'
import { relatedSide } from './unlisted.ts'
import { db } from './db/index.ts'
import { playlists, stationResume, stations } from './db/schema.ts'
import { mapBounded, previewSeed } from './previews.ts'
import * as stash from './stash.ts'

// Each station's cover: its starting scene, or a scene from its filters (stable per station).
async function cover(s: { id: number; query: SceneQuery; fromScene: string | null }): Promise<string | null> {
  try {
    if (s.fromScene) return (await stash.findScenesByIds([s.fromScene]))[0]?.screenshot ?? null
    const q: SceneQuery = { ...s.query, sort: 'random', seed: s.id * 7919, noUnlisted: true }
    const r = await stash.findScenes(stash.findFilter({ ...q, perPage: 1 }), stash.sceneFilter(q, await exclusions()))
    return r.items[0]?.screenshot ?? null
  } catch {
    return null
  }
}

export async function listStations(): Promise<SavedStation[]> {
  const rows = await db.select().from(stations).orderBy(asc(stations.position), asc(stations.id))
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      query: r.query as SceneQuery,
      from: r.fromScene ?? undefined,
      mode: r.mode as StationMode,
      window: r.window,
      cover: await cover({ id: r.id, query: r.query as SceneQuery, fromScene: r.fromScene }),
    })),
  )
}

export async function addStation(s: StationInput): Promise<number> {
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${stations.position}), -1)::int + 1` }).from(stations)
  const [r] = await db
    .insert(stations)
    .values({ name: s.name, query: s.query, fromScene: s.from ?? null, mode: s.mode, window: s.window, position: next })
    .returning({ id: stations.id })
  return r!.id
}

export async function updateStation(id: number, patch: Partial<StationInput>) {
  const set: Partial<typeof stations.$inferInsert> = {}
  if (patch.name !== undefined) set.name = patch.name
  if (patch.query !== undefined) set.query = patch.query
  if (patch.mode !== undefined) set.mode = patch.mode
  if (patch.window !== undefined) set.window = patch.window
  if (Object.keys(set).length) await db.update(stations).set(set).where(eq(stations.id, id))
}

export async function deleteStation(id: number) {
  await db.delete(stations).where(eq(stations.id, id))
  await db.delete(stationResume).where(eq(stationResume.key, `id:${id}`))
}

export async function reorderStations(ids: number[]) {
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) await tx.update(stations).set({ position }).where(eq(stations.id, id))
  })
}

// --- what each station looks like ----------------------------------------------------------

const PREVIEW_ITEMS = 8
const CONCURRENT = 6

// One answer for every card on the Stations page: each saved station's preview plus one per ad
// hoc query (the quick-start cards), answered under the key the client sent. Each is one cached
// Stash query, so a reload within the data TTL costs nothing.
export async function previews(day: number, queries: { key: string; query: SceneQuery }[]): Promise<StationPreviews> {
  const blocked = await exclusions()
  const rows = await db.select({ id: stations.id, query: stations.query, fromScene: stations.fromScene }).from(stations)
  const byQuery = async (q: SceneQuery): Promise<StationPreview> => {
    const shuffled: SceneQuery = { ...q, sort: 'random', seed: previewSeed(day, q), noUnlisted: true }
    const r = await stash.findScenes(stash.findFilter({ ...shuffled, perPage: PREVIEW_ITEMS }), stash.sceneFilter(shuffled, blocked))
    return { total: r.total, items: r.items }
  }
  const byScene = async (from: string): Promise<StationPreview> => {
    const r = await stash.getScene(from)
    const items = r ? await stash.relatedScenes(from, r.performerIds, r.studioId, r.tagIds, blocked, null, relatedSide(r.marks, blocked)) : []
    return { total: null, items: items.slice(0, PREVIEW_ITEMS) }
  }
  const safe = (p: Promise<StationPreview>) => p.catch((): StationPreview => ({ total: null, items: [] }))
  const [saved, adHoc] = await Promise.all([
    mapBounded(rows, CONCURRENT, (r) => safe(r.fromScene ? byScene(r.fromScene) : byQuery(r.query as SceneQuery))),
    mapBounded(queries, CONCURRENT, (q) => safe(byQuery(q.query))),
  ])
  return {
    stations: Object.fromEntries(rows.map((r, i) => [r.id, saved[i]!])),
    queries: Object.fromEntries(queries.map((q, i) => [q.key, adHoc[i]!])),
  }
}

// --- where each station was left ---------------------------------------------------------

const KEEP_RESUMES = 50

// Only stations the user made remember their place: saved ones (`id:<n>`) and playlists
// (`pl:<n>`). Ad-hoc ones (`from:<scene>`, `q:<filters>`) were remembered until 2026-10-31 and
// filled Home's "Pick up a station" with stations nobody created; their rows are dropped here.
const remembered = (key: string) => key.startsWith('id:') || key.startsWith('pl:')
const forgetAdHoc = () => db.delete(stationResume).where(and(notLike(stationResume.key, 'id:%'), notLike(stationResume.key, 'pl:%')))

export async function listResume(): Promise<StationResume[]> {
  await forgetAdHoc()
  const rows = await db.select().from(stationResume).orderBy(desc(stationResume.updatedAt))
  const [scenes, names] = await Promise.all([
    exclusions().then((ex) => stash.findScenesByIds(rows.map((r) => r.sceneId), ex)).then((all) => new Map(all.map((s) => [s.id, s]))),
    resumeNames(rows.map((r) => r.key)),
  ])
  // A row whose station or playlist is gone (deleted before 2026-10-31, when deletion did not
  // remove it) is left out rather than shown as a nameless "Everything" card.
  return rows.flatMap((r) => {
    const s = scenes.get(r.sceneId)
    const name = names.get(r.key)
    return s && name !== undefined ? [{ key: r.key, name, seconds: r.seconds, updatedAt: r.updatedAt.toISOString(), scene: s }] : []
  })
}

// The saved station's or playlist's name behind each resume key (`id:<n>`, `pl:<n>`).
async function resumeNames(keys: string[]): Promise<Map<string, string>> {
  const ids = (prefix: string) => keys.filter((k) => k.startsWith(prefix)).map((k) => Number(k.slice(prefix.length))).filter(Number.isInteger)
  const [st, pl] = await Promise.all([
    ids('id:').length ? db.select({ id: stations.id, name: stations.name }).from(stations).where(inArray(stations.id, ids('id:'))) : [],
    ids('pl:').length ? db.select({ id: playlists.id, name: playlists.name }).from(playlists).where(inArray(playlists.id, ids('pl:'))) : [],
  ])
  return new Map([...st.map((s) => [`id:${s.id}`, s.name] as const), ...pl.map((p) => [`pl:${p.id}`, p.name] as const)])
}

export async function saveResume(key: string, sceneId: string, seconds: number) {
  if (!remembered(key)) return
  const row = { key, sceneId, seconds: Math.floor(seconds), updatedAt: new Date() }
  await db.insert(stationResume).values(row).onConflictDoUpdate({ target: stationResume.key, set: row })
  const keep = db.select({ key: stationResume.key }).from(stationResume).orderBy(desc(stationResume.updatedAt)).limit(KEEP_RESUMES)
  await db.delete(stationResume).where(notInArray(stationResume.key, keep))
}
