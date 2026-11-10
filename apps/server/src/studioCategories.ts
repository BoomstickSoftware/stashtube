import type { Ref, StudioCategoriesStatus, SyncRun } from '@flix/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { ALL_TAGS, PARENT } from './cast.ts'
import { db } from './db/index.ts'
import { studioCategories, studioCategoryAdds } from './db/schema.ts'
import * as stash from './stash.ts'

// Studio default categories (wiki features/studio-default-categories). flix stores, per studio,
// categories every one of its videos should carry (the studio's own videos: an umbrella studio's
// niches differ, so sub-studios are not included). The sync adds each missing one, records that
// it did (studio_category_adds), and puts it back if it is removed by hand. When a category stops
// being a default (or the video changes studio), flix takes it off only the videos it added it
// to: a category that came from Stash or StashDB is never removed.

type SceneInput = { id: string; studioId: string | null; tagIds: string[] }
type Pair = [sceneId: string, tagId: string]
export interface Plan {
  add: Map<string, string[]> // tag id → scenes to add it to
  remove: Map<string, string[]> // tag id → scenes to take it off
  record: Pair[] // flix added these
  forget: Pair[] // no longer flix's to keep
}

// What one sync writes, from every scene, the defaults per studio and what flix added before.
export function plan(scenes: SceneInput[], defaults: Map<string, string[]>, added: Pair[]): Plan {
  const p: Plan = { add: new Map(), remove: new Map(), record: [], forget: [] }
  const push = (m: Map<string, string[]>, tag: string, id: string) => m.set(tag, [...(m.get(tag) ?? []), id])
  const byId = new Map(scenes.map((s) => [s.id, s]))
  for (const s of scenes) {
    for (const tag of (s.studioId && defaults.get(s.studioId)) || []) {
      if (s.tagIds.includes(tag)) continue
      push(p.add, tag, s.id)
      p.record.push([s.id, tag])
    }
  }
  for (const [sceneId, tag] of added) {
    const s = byId.get(sceneId)
    if (!s) {
      p.forget.push([sceneId, tag]) // the video is gone
      continue
    }
    if ((s.studioId && defaults.get(s.studioId)?.includes(tag)) || false) continue
    if (s.tagIds.includes(tag)) push(p.remove, tag, s.id)
    p.forget.push([sceneId, tag])
  }
  return p
}

// flix files the Cast categories itself; they cannot be studio defaults.
export const isCastTag = (name: string) => name === PARENT || ALL_TAGS.includes(name)

let status: SyncRun | null = null
let running: Promise<void> | null = null
let next: Promise<void> | null = null

// One sync at a time; a call during a run waits for one more run after it, so an edit made
// meanwhile is applied before the call returns.
export function syncStudioCategories(): Promise<void> {
  if (!running) {
    running = run().finally(() => (running = null))
    return running
  }
  next ??= running.then(() => {
    next = null
    return syncStudioCategories()
  })
  return next
}

async function run() {
  const started = Date.now()
  try {
    let rows = await db.select().from(studioCategories)
    const adds = await db.select().from(studioCategoryAdds)
    if (!rows.length && !adds.length) {
      status = { at: new Date().toISOString(), scenes: 0, added: 0, removed: 0, ms: Date.now() - started, error: null }
      return
    }
    // a category deleted in Stash stops being a default (writing it would fail the whole sync)
    const live = new Set((await stash.tagsByIds([...new Set(rows.map((r) => r.tagId))])).map((t) => t.id))
    const gone = [...new Set(rows.filter((r) => !live.has(r.tagId)).map((r) => r.tagId))]
    if (gone.length) {
      await db.delete(studioCategories).where(inArray(studioCategories.tagId, gone))
      rows = rows.filter((r) => live.has(r.tagId))
    }
    const defaults = new Map<string, string[]>()
    for (const r of rows) defaults.set(r.studioId, [...(defaults.get(r.studioId) ?? []), r.tagId])
    const scenes = await stash.studioTagInputs()
    const p = plan(
      scenes,
      defaults,
      adds.filter((a) => !gone.includes(a.tagId)).map((a) => [a.sceneId, a.tagId]),
    )
    // Stash first: if recording fails, the video merely keeps a category flix will not remove
    let added = 0
    let removed = 0
    for (const [tag, ids] of p.add) {
      await stash.bulkTag(ids, [tag], 'ADD')
      added += ids.length
    }
    for (let i = 0; i < p.record.length; i += 1000) {
      await db
        .insert(studioCategoryAdds)
        .values(p.record.slice(i, i + 1000).map(([sceneId, tagId]) => ({ sceneId, tagId })))
        .onConflictDoNothing()
    }
    for (const [tag, ids] of p.remove) {
      await stash.bulkTag(ids, [tag], 'REMOVE')
      removed += ids.length
    }
    const forget = new Map<string, string[]>()
    for (const [sceneId, tag] of [...p.forget, ...adds.filter((a) => gone.includes(a.tagId)).map((a): Pair => [a.sceneId, a.tagId])])
      forget.set(tag, [...(forget.get(tag) ?? []), sceneId])
    for (const [tag, ids] of forget) {
      for (let i = 0; i < ids.length; i += 1000)
        await db.delete(studioCategoryAdds).where(and(eq(studioCategoryAdds.tagId, tag), inArray(studioCategoryAdds.sceneId, ids.slice(i, i + 1000))))
    }
    if (added || removed) await stash.acceptOwnChanges()
    status = { at: new Date().toISOString(), scenes: scenes.length, added, removed, ms: Date.now() - started, error: null }
  } catch (e) {
    status = { at: new Date().toISOString(), scenes: 0, added: 0, removed: 0, ms: Date.now() - started, error: (e as Error).message }
    console.error('studio categories sync:', (e as Error).message)
  }
}

// Whether the last sync finished without an error (categorySync.ts keeps its baseline by it).
export const studioCategoriesSyncOk = () => status?.error === null

export async function studioCategoryList(studioId: string): Promise<Ref[]> {
  const rows = await db.select().from(studioCategories).where(eq(studioCategories.studioId, studioId)).orderBy(studioCategories.tagName)
  return rows.map((r) => ({ id: r.tagId, name: r.tagName }))
}

// Replace a studio's defaults (unknown and Cast categories are dropped), then sync so its videos
// follow at once. Answers with what the run wrote.
export async function setStudioCategories(studioId: string, studioName: string, tagIds: string[]): Promise<{ tags: Ref[]; lastSync: SyncRun | null }> {
  const tags = (await stash.tagsByIds([...new Set(tagIds)])).filter((t) => !isCastTag(t.name))
  await db.transaction(async (tx) => {
    await tx.delete(studioCategories).where(eq(studioCategories.studioId, studioId))
    if (tags.length) await tx.insert(studioCategories).values(tags.map((t) => ({ studioId, studioName, tagId: t.id, tagName: t.name })))
  })
  await syncStudioCategories()
  return { tags: await studioCategoryList(studioId), lastSync: status }
}

export async function studioCategoriesStatus(): Promise<StudioCategoriesStatus> {
  const rows = await db.select().from(studioCategories).orderBy(studioCategories.studioName, studioCategories.tagName)
  const studios = new Map<string, StudioCategoriesStatus['studios'][number]>()
  for (const r of rows) {
    const s = studios.get(r.studioId) ?? { id: r.studioId, name: r.studioName, tags: [] }
    s.tags.push({ id: r.tagId, name: r.tagName })
    studios.set(r.studioId, s)
  }
  return { studios: [...studios.values()], lastSync: status }
}
