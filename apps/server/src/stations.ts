import type { SavedStation, SceneQuery, StationInput, StationMode } from '@flix/shared'
import { asc, eq, sql } from 'drizzle-orm'
import { exclusions } from './blocklist.ts'
import { db } from './db/index.ts'
import { stations } from './db/schema.ts'
import * as stash from './stash.ts'

// Each station's cover: its starting scene, or a scene from its filters (stable per station).
async function cover(s: { id: number; query: SceneQuery; fromScene: string | null }): Promise<string | null> {
  try {
    if (s.fromScene) return (await stash.findScenesByIds([s.fromScene]))[0]?.screenshot ?? null
    const q: SceneQuery = { ...s.query, sort: 'random', seed: s.id * 7919 }
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
}

export async function reorderStations(ids: number[]) {
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) await tx.update(stations).set({ position }).where(eq(stations.id, id))
  })
}
