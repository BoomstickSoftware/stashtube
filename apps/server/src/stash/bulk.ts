// Bulk category reads and writes: the Cast and studio-default syncs and the bulk Categories sheet.
import { dataCache } from '../cache/data.ts'
import type { Mutation, Query, SceneFilterType } from '../stash.schema.ts'
import { acceptOwnChanges } from './changes.ts'
import { gql, mutate, query } from './client.ts'

// --- Cast categories (cast.ts) ----------------------------------------------------------

// Every scene's performer genders and category ids, uncached: the Cast sync must see the library
// as it is now. Gender null: not set on the performer.
export async function castInputs(): Promise<{ id: string; tagIds: string[]; genders: (string | null)[] }[]> {
  const d = await gql<Pick<Query, 'findScenes'>>(`{ findScenes(filter: { per_page: -1 }) { scenes { id tags { id } performers { gender } } } }`)
  return d.findScenes.scenes.map((s) => ({ id: s.id, tagIds: s.tags.map((t) => t.id), genders: s.performers.map((p) => p.gender ?? null) }))
}

// The ids of the categories with these names that exist, by name. Creates nothing (a GET reads
// it: the Settings Cast list); cached like any tag read.
export async function tagIdsByName(names: string[]): Promise<Map<string, string>> {
  const d = await query<Pick<Query, 'findTags'>>(`{ findTags(filter: { per_page: -1 }) { tags { id name } } }`, {}, ['tag'])
  const wanted = new Set(names)
  return new Map(d.findTags.tags.filter((t) => wanted.has(t.name)).map((t) => [t.name, t.id]))
}

// The ids of these categories, creating any that are missing under `parent` (created too).
export async function ensureTags(names: string[], parent: string): Promise<Map<string, string>> {
  const find = async (ns: string[]) => {
    const d = await gql<Pick<Query, 'findTags'>>(`{ findTags(filter: { per_page: -1 }) { tags { id name } } }`)
    const wanted = new Set(ns)
    return new Map(d.findTags.tags.filter((t) => wanted.has(t.name)).map((t) => [t.name, t.id]))
  }
  const have = await find([parent, ...names])
  const create = async (name: string, parentIds: string[] = []) => {
    const c = await mutate<Pick<Mutation, 'tagCreate'>>(`mutation($i: TagCreateInput!) { tagCreate(input: $i) { id } }`, { i: { name, parent_ids: parentIds } }, ['tag'])
    return c.tagCreate!.id
  }
  const parentId = have.get(parent) ?? (await create(parent))
  const out = new Map<string, string>()
  for (const n of names) out.set(n, have.get(n) ?? (await create(n, [parentId])))
  return out
}

// Adds or removes one category on many scenes, in chunks. Lists go stale like any tag edit
// (served once more while they refresh) rather than being dropped: the Cast sync runs right after
// a scan, and dropping every scene query then threw away the warm it had just been given.
export async function bulkTag(sceneIds: string[], tagIds: string[], mode: 'ADD' | 'REMOVE') {
  for (let i = 0; i < sceneIds.length; i += 500) {
    await mutate(`mutation($i: BulkSceneUpdateInput!) { bulkSceneUpdate(input: $i) { id } }`, { i: { ids: sceneIds.slice(i, i + 500), tag_ids: { ids: tagIds, mode } } }, [], ['scene', 'tag'])
  }
}

// The ids of every scene a list's filter matches, asked fresh (a bulk edit must not act on a
// cached list from before a scan).
export async function sceneIdsMatching(sceneFilter: SceneFilterType): Promise<string[]> {
  const d = await gql<Pick<Query, 'findScenes'>>(`query($s: SceneFilterType) { findScenes(filter: { per_page: -1 }, scene_filter: $s) { scenes { id } } }`, { s: sceneFilter })
  return d.findScenes.scenes.map((s) => s.id)
}

// Adds and removes categories on many scenes at once (the bulk Categories sheet). Each scene's
// own entry is dropped, lists go stale like any tag edit (wiki decisions/ratings-expire-lists).
export async function bulkSceneTags(sceneIds: string[], add: string[], remove: string[]) {
  if (add.length) await bulkTag(sceneIds, add, 'ADD')
  if (remove.length) await bulkTag(sceneIds, remove, 'REMOVE')
  dataCache.invalidate(...sceneIds.map((id) => `scene:${id}`))
  await acceptOwnChanges()
}

// Every scene's studio and categories, fresh (the studio-defaults sync).
export async function studioTagInputs(): Promise<{ id: string; studioId: string | null; tagIds: string[] }[]> {
  const d = await gql<Pick<Query, 'findScenes'>>(`{ findScenes(filter: { per_page: -1 }) { scenes { id studio { id } tags { id } } } }`)
  return d.findScenes.scenes.map((s) => ({ id: s.id, studioId: s.studio?.id ?? null, tagIds: s.tags.map((t) => t.id) }))
}

// These categories' names, fresh; ids Stash no longer has are left out.
export async function tagsByIds(ids: string[]): Promise<{ id: string; name: string }[]> {
  if (!ids.length) return []
  const d = await gql<Pick<Query, 'findTags'>>(`query($ids: [ID!]) { findTags(ids: $ids, filter: { per_page: -1 }) { tags { id name } } }`, { ids })
  return d.findTags.tags.map((t) => ({ id: t.id, name: t.name }))
}

// Scene counts of these categories (the Settings Cast list).
export async function tagCounts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map()
  const d = await query<Pick<Query, 'findTags'>>(`query($ids: [ID!]) { findTags(ids: $ids, filter: { per_page: -1 }) { tags { id scene_count } } }`, { ids }, ['scene', 'tag'])
  return new Map(d.findTags.tags.map((t) => [t.id, t.scene_count ?? 0]))
}
