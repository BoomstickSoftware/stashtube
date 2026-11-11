// Whole-library reads other modules lean on: artwork for the warm, StashDB ids for Whisparr and
// Discover, the category lookup, Stash's stash-box credentials.
import { PINNED } from '../cache/memory.ts'
import type { Query } from '../stash.schema.ts'
import { gql, memoBy, query } from './client.ts'
import { mediaUrl } from './mappers.ts'

// --- artwork ----------------------------------------------------------------------------

// Every generated image and clip the app shows, as /media/stash URLs (the nightly warm).
export async function allArtwork(): Promise<string[]> {
  const all = '{ per_page: -1 }'
  const r = await gql<Pick<Query, 'findScenes' | 'findPerformers' | 'findStudios'>>(`{
    findScenes(filter: ${all}) { scenes { paths { screenshot preview vtt } } }
    findPerformers(filter: ${all}) { performers { image_path } }
    findStudios(filter: ${all}) { studios { image_path } }
  }`)
  return [
    ...r.findScenes.scenes.flatMap((s) => [s.paths.screenshot, s.paths.preview, s.paths.vtt]),
    ...r.findPerformers.performers.map((p) => p.image_path),
    ...r.findStudios.studios.map((s) => s.image_path),
  ]
    .map(mediaUrl)
    .filter((u): u is string => !!u)
}

// --- Whisparr bridge ----------------------------------------------------------------------

// A performer's or studio's StashDB ids (several when StashDB merged duplicates): the key
// Whisparr files its scenes under.
export async function stashIdsOf(kind: 'performer' | 'studio', id: string): Promise<string[]> {
  if (kind === 'performer') {
    const d = await query<Pick<Query, 'findPerformer'>>(`query($id: ID!) { findPerformer(id: $id) { stash_ids { stash_id } } }`, { id }, ['performer', `performer:${id}`])
    return d.findPerformer?.stash_ids.map((s) => s.stash_id) ?? []
  }
  const d = await query<Pick<Query, 'findStudio'>>(`query($id: ID!) { findStudio(id: $id) { stash_ids { stash_id } } }`, { id }, ['studio', `studio:${id}`])
  return d.findStudio?.stash_ids.map((s) => s.stash_id) ?? []
}

// The favourite performers' StashDB ids, for "new from your favourites" that is not downloaded.
export async function favoritePerformerStashIds(): Promise<string[]> {
  const d = await query<Pick<Query, 'findPerformers'>>(
    `{ findPerformers(filter: { per_page: -1 }, performer_filter: { filter_favorites: true }) { performers { stash_ids { stash_id } } } }`,
    {},
    ['performer'],
  )
  return d.findPerformers.performers.flatMap((p) => p.stash_ids.map((s) => s.stash_id))
}

// The favourite performers with their StashDB ids, for the follow sync (sync.ts). Uncached, so
// it throws when Stash is down: the sync then skips its run rather than read "no favourites".
export async function favoritePerformers(): Promise<{ id: string; name: string; stashIds: string[] }[]> {
  const d = await gql<Pick<Query, 'findPerformers'>>(
    `{ findPerformers(filter: { per_page: -1 }, performer_filter: { filter_favorites: true }) { performers { id name stash_ids { stash_id } } } }`,
  )
  return d.findPerformers.performers.map((p) => ({ id: p.id, name: p.name, stashIds: p.stash_ids.map((s) => s.stash_id) }))
}

// The favourite studios with their StashDB ids, for the follow sync; uncached like the above.
export async function favoriteStudios(): Promise<{ id: string; name: string; stashIds: string[] }[]> {
  const d = await gql<Pick<Query, 'findStudios'>>(
    `{ findStudios(filter: { per_page: -1 }, studio_filter: { favorite: true }) { studios { id name stash_ids { stash_id } } } }`,
  )
  return d.findStudios.studios.map((s) => ({ id: s.id, name: s.name, stashIds: s.stash_ids.map((x) => x.stash_id) }))
}

// The library's performer, studio or tag carrying this StashDB id (Discover's "in your library"
// link), or null. Cached like any read; a new link shows after the next change check.
export async function libraryIdForStashId(kind: 'performer' | 'studio' | 'tag', stashId: string): Promise<string | null> {
  const crit = { stash_id: stashId, modifier: 'EQUALS' }
  if (kind === 'performer') {
    const d = await query<Pick<Query, 'findPerformers'>>(`query($c: StashIDCriterionInput) { findPerformers(filter: { per_page: 1 }, performer_filter: { stash_id_endpoint: $c }) { performers { id } } }`, { c: crit }, ['performer'])
    return d.findPerformers.performers[0]?.id ?? null
  }
  if (kind === 'studio') {
    const d = await query<Pick<Query, 'findStudios'>>(`query($c: StashIDCriterionInput) { findStudios(filter: { per_page: 1 }, studio_filter: { stash_id_endpoint: $c }) { studios { id } } }`, { c: crit }, ['studio'])
    return d.findStudios.studios[0]?.id ?? null
  }
  const d = await query<Pick<Query, 'findTags'>>(`query($c: StashIDCriterionInput) { findTags(filter: { per_page: 1 }, tag_filter: { stash_id_endpoint: $c }) { tags { id } } }`, { c: crit }, ['tag'])
  return d.findTags.tags[0]?.id ?? null
}

// Library categories by their StashDB id (`sid:<uuid>`) and by lower-case name and alias
// (`name:<name>`): Discover's category pills link to the library's own. One query, cached until a
// category changes.
export async function tagLookup(): Promise<Map<string, string>> {
  const d = await query<Pick<Query, 'findTags'>>(`{ findTags(filter: { per_page: -1 }) { tags { id name aliases stash_ids { stash_id } } } }`, {}, ['tag'])
  return tagLookupOf(d)
}
const tagLookupOf = memoBy((d: Pick<Query, 'findTags'>) => {
  const m = new Map<string, string>()
  for (const t of d.findTags.tags) {
    for (const s of t.stash_ids ?? []) m.set(`sid:${s.stash_id}`, t.id)
    for (const n of [t.name, ...(t.aliases ?? [])]) if (!m.has(`name:${n.toLowerCase()}`)) m.set(`name:${n.toLowerCase()}`, t.id)
  }
  return m
})

// The ids of the categories pinned on the Categories page (Stash's tag favourite): a wanted card
// lists those first. Cached until a category changes (a pin drops `tag`).
export async function favoriteTagIds(): Promise<Set<string>> {
  const d = await query<Pick<Query, 'findTags'>>(`{ findTags(filter: { per_page: -1 }, tag_filter: { favorite: true }) { tags { id } } }`, {}, ['tag'])
  return favoriteTagSet(d)
}
const favoriteTagSet = memoBy((d: Pick<Query, 'findTags'>) => new Set(d.findTags.tags.map((t) => t.id)))

// Stash's stash-box endpoints with their keys: StashDB's catalogue is queried with Stash's own
// credentials unless flix has its own (config.stashdb). Uncached and never logged.
export const stashBoxes = async () => (await gql<Pick<Query, 'configuration'>>('{ configuration { general { stashBoxes { name endpoint api_key } } } }')).configuration.general.stashBoxes

// Every library scene's StashDB id → Stash scene id, to tell "already here" from "missing"
// when StashDB lists a performer's or studio's scenes. PINNED: every shelf page reads it.
// Tagged `library`, not `scene`: a play or a rating does not move a StashDB id, and as `scene`
// every progress save made the next Discover page (or the Waiting tab's 10 s poll) refetch the
// whole library (_until 2026-11-09_). A scan or Identify expires it through change detection; a
// delete drops it. The Map is built once per fetched answer, not on every call.
export async function sceneStashIdMap(): Promise<Map<string, string>> {
  const d = await query<Pick<Query, 'findScenes'>>('{ findScenes(filter: { per_page: -1 }) { scenes { id stash_ids { stash_id } } } }', {}, ['library', PINNED])
  return stashIdMapOf(d)
}
const stashIdMapOf = memoBy((d: Pick<Query, 'findScenes'>) => {
  const map = new Map<string, string>()
  for (const s of d.findScenes.scenes) for (const x of s.stash_ids) map.set(x.stash_id, s.id)
  return map
})
