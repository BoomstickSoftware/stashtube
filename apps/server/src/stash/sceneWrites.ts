// Writes to one scene: activity, edits, the reserved tags, markers and the delete.
import type { Marker, SceneCard } from '@flix/shared'
import type { Mutation, Query, SceneMarkerCreateInput, SceneMarkerUpdateInput, SceneUpdateInput } from '../stash.schema.ts'
import { gql, mutate, StashError } from './client.ts'
import { findFilter } from './filters.ts'
import { MARKER_FIELDS, rating100, sceneTitle, toMarker } from './mappers.ts'
import { findScenes } from './scenes.ts'

// A rating, O, edit or play drops only its scene and marks every list stale: lists are served
// once more while they refresh (so one sorted by rating may lag one refresh, a decision of
// 2026-10-31), instead of Home and Browse rebuilding cold after every tap on a star.
export async function updateSceneRating(id: string, stars: number | null) {
  await mutate(`mutation($id: ID!, $r: Int) { sceneUpdate(input: { id: $id, rating100: $r }) { id } }`, {
    id,
    r: rating100(stars),
  }, [`scene:${id}`], ['scene'])
}

// Plays and progress saves (every 15 s while watching) also drop the lists that filter or
// sort by activity: small ones (Continue, Recently watched). The big computed answers (Home, the
// facets) do not carry the activity tags: they are only expired through `scene`, served stale and
// rebuilt in the background, so watching never sends the next Home or Filters to a cold build.
export async function addScenePlay(id: string) {
  await mutate(`mutation($id: ID!) { sceneAddPlay(id: $id) { count } }`, { id }, [`scene:${id}`, 'activity:play'], ['scene'])
}

export async function saveSceneActivity(id: string, resumeTime: number, playDuration: number) {
  await mutate(`mutation($id: ID!, $r: Float, $d: Float) { sceneSaveActivity(id: $id, resume_time: $r, playDuration: $d) }`, {
    id,
    r: resumeTime,
    d: playDuration,
  }, [`scene:${id}`, 'activity:resume'], ['scene'])
}

// Clear resume points (Continue's Remove, the 30-day expiry); one write per video, in order.
export async function clearResume(ids: string[]) {
  for (const id of ids) await saveSceneActivity(id, 0, 0)
}

// Videos in Continue with the last time they were touched: the last play, or for a resume point
// with no play on record (set before flix counted plays, or in Stash's own UI) when it was added.
// Uncached: the expiry must see Stash as it is.
export async function continueAges(): Promise<{ id: string; touched: string }[]> {
  const d = await gql<Pick<Query, 'findScenes'>>(
    `{ findScenes(filter: { per_page: -1 }, scene_filter: { resume_time: { value: 0, modifier: GREATER_THAN } }) { scenes { id last_played_at created_at } } }`,
  )
  return d.findScenes.scenes.map((s) => ({ id: s.id, touched: s.last_played_at ?? s.created_at }))
}

export async function addSceneO(id: string) {
  const d = await mutate<Pick<Mutation, 'sceneAddO'>>(`mutation($id: ID!) { sceneAddO(id: $id) { count } }`, { id }, [`scene:${id}`], ['scene'])
  return d.sceneAddO.count
}

// --- edits ------------------------------------------------------------------------

// Tags change as deltas (Stash adds or removes the given ids), never as a whole list: a list
// read from a cached scene can be older than a sync or bulk edit, and writing it back dropped
// the tags added since.
export async function updateScene(id: string, patch: { title?: string; addTagIds?: string[]; removeTagIds?: string[] }) {
  if (patch.title !== undefined) {
    const input: SceneUpdateInput = { id, title: patch.title }
    await mutate(`mutation($i: SceneUpdateInput!) { sceneUpdate(input: $i) { id } }`, { i: input }, [`scene:${id}`], ['scene'])
  }
  // a tag change moves the scene counts on tag cards, so the 'tag' lists go stale too (nothing
  // needs them dropped: the facets and tiles are tagged 'scene')
  for (const [ids, mode] of [[patch.addTagIds, 'ADD'], [patch.removeTagIds, 'REMOVE']] as const) {
    if (!ids?.length) continue
    await mutate(`mutation($i: BulkSceneUpdateInput!) { bulkSceneUpdate(input: $i) { id } }`, { i: { ids: [id], tag_ids: { ids, mode } } }, [`scene:${id}`], ['scene', 'tag'])
  }
}

// What deleting a scene needs: its files and StashDB links. Uncached, so it sees the scene as it is now.
// `stashDbIds`: only the ids from StashDB's endpoint (Whisparr's exclusions are keyed by them).
export async function sceneForDeletion(id: string): Promise<{ title: string; paths: string[]; stashIds: string[]; stashDbIds: string[] } | null> {
  const d = await gql<Pick<Query, 'findScene'>>(`query($id: ID!) { findScene(id: $id) { id title files { path } stash_ids { stash_id endpoint } } }`, { id })
  const s = d.findScene
  if (!s) return null
  return { title: sceneTitle(s), paths: s.files.map((f) => f.path), stashIds: s.stash_ids.map((x) => x.stash_id), stashDbIds: s.stash_ids.filter((x) => /stashdb\.org/.test(x.endpoint)).map((x) => x.stash_id) }
}

// Drops the scene and its generated sprites and previews. The file is Whisparr's to delete:
// Stash mounts the library read-only.
// A scan or identify job can hold Stash's database lock far longer than gql's short retries,
// so keep trying for up to DESTROY_WAIT ms (the caller's file is already gone by then).
const DESTROY_WAIT = 30_000
export async function destroyScene(id: string) {
  const until = Date.now() + DESTROY_WAIT
  for (;;) {
    try {
      await mutate(
        `mutation($i: SceneDestroyInput!) { sceneDestroy(input: $i) }`,
        { i: { id, delete_file: false, delete_generated: true, destroy_file_entry: true } },
        ['scene', 'performer', 'studio', 'tag', 'library'],
      )
      return
    } catch (e) {
      if (!/database is locked/.test((e as Error).message) || Date.now() > until) throw e
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

// A Stash tag flix reserves for a mark on one video, created on first use (`create`) and looked
// up once. "Unlisted" (wiki features/vault) and the retired "Not interested": until 2026-11-09 it
// hid a video from every list; now Cleanup lists what still carries it, to delete or keep
// (decisions/hide-means-delete-block-or-unlist).
function reservedTag(name: string) {
  let id: string | null | undefined
  let lookup: Promise<string | null> | null = null // shared by the requests that arrive before it is known
  const find = async (create: boolean): Promise<string | null> => {
    const d = await gql<Pick<Query, 'findTags'>>(`query($n: String!) { findTags(tag_filter: { name: { value: $n, modifier: EQUALS } }) { tags { id } } }`, { n: name })
    id = d.findTags.tags[0]?.id ?? null
    if (!id && create) {
      const c = await mutate<Pick<Mutation, 'tagCreate'>>(`mutation($n: String!) { tagCreate(input: { name: $n }) { id } }`, { n: name }, ['tag'])
      id = c.tagCreate?.id ?? null
    }
    return id ?? null
  }
  return (create = false): Promise<string | null> => {
    if (id !== undefined && !(create && id === null)) return Promise.resolve(id)
    if (create) return find(true)
    lookup ??= find(false).finally(() => (lookup = null))
    return lookup
  }
}
export const hiddenTag = reservedTag('Not interested')
export const unlistedTag = reservedTag('Unlisted')

async function setReservedTag(tagOf: (create: boolean) => Promise<string | null>, id: string, on: boolean) {
  const tag = await tagOf(on)
  if (!tag) return
  await updateScene(id, on ? { addTagIds: [tag] } : { removeTagIds: [tag] })
}
export const setSceneHidden = (id: string, hidden: boolean) => setReservedTag(hiddenTag, id, hidden)
export const setSceneUnlisted = (id: string, unlisted: boolean) => setReservedTag(unlistedTag, id, unlisted)

export async function hiddenScenes(): Promise<SceneCard[]> {
  const tag = await hiddenTag()
  if (!tag) return []
  return (await findScenes(findFilter({ sort: 'updated_at', perPage: 200 }), { tags: { value: [tag], modifier: 'INCLUDES', depth: 0 } })).items
}

// Videos unlisted by hand (the "Unlisted" tag), newest change first, for Settings.
export async function unlistedScenes(): Promise<SceneCard[]> {
  const tag = await unlistedTag()
  if (!tag) return []
  return (await findScenes(findFilter({ sort: 'updated_at', perPage: 200 }), { tags: { value: [tag], modifier: 'INCLUDES', depth: 0 } })).items
}

// Markers need a primary tag; flix's own go under "Highlight", created on first use.
async function highlightTag(): Promise<string> {
  const d = await gql<Pick<Query, 'findTags'>>(`{ findTags(tag_filter: { name: { value: "Highlight", modifier: EQUALS } }) { tags { id } } }`)
  if (d.findTags.tags[0]) return d.findTags.tags[0].id
  const c = await mutate<Pick<Mutation, 'tagCreate'>>(`mutation { tagCreate(input: { name: "Highlight" }) { id } }`, {}, ['tag'])
  if (!c.tagCreate) throw new StashError('tagCreate returned no tag')
  return c.tagCreate.id
}

// Returns the marker, so the player can offer Undo (and an O upgrade) right after.
export async function createMarker(sceneId: string, seconds: number, title: string, tagId?: string): Promise<Marker> {
  const i: SceneMarkerCreateInput = { scene_id: sceneId, seconds, title, primary_tag_id: tagId || (await highlightTag()) }
  const d = await mutate<Pick<Mutation, 'sceneMarkerCreate'>>(
    `mutation($i: SceneMarkerCreateInput!) { sceneMarkerCreate(input: $i) { ${MARKER_FIELDS} } }`,
    { i },
    [`scene:${sceneId}`],
  )
  if (!d.sceneMarkerCreate) throw new StashError('sceneMarkerCreate returned no marker')
  return toMarker(d.sceneMarkerCreate)
}

export async function updateMarker(sceneId: string, id: string, patch: { title?: string; tagId?: string }): Promise<Marker> {
  const i: SceneMarkerUpdateInput = { id, title: patch.title, primary_tag_id: patch.tagId }
  const d = await mutate<Pick<Mutation, 'sceneMarkerUpdate'>>(
    `mutation($i: SceneMarkerUpdateInput!) { sceneMarkerUpdate(input: $i) { ${MARKER_FIELDS} } }`,
    { i },
    [`scene:${sceneId}`],
  )
  if (!d.sceneMarkerUpdate) throw new StashError('sceneMarkerUpdate returned no marker')
  return toMarker(d.sceneMarkerUpdate)
}

export async function deleteMarker(sceneId: string, id: string) {
  await mutate(`mutation($id: ID!) { sceneMarkerDestroy(id: $id) }`, { id }, [`scene:${sceneId}`])
}
