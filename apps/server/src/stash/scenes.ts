import type { DuplicateScene, SceneCard } from '@flix/shared'
import { VOLATILE } from '../cache/memory.ts'
import type { FindFilterType, Query, Scene, SceneFilterType } from '../stash.schema.ts'
import { activityTags, daySeed, gql, query } from './client.ts'
import { type Exclusions, type SceneMarks, unlistedReasons, isBlocked, withExclusions, withinReasons } from './filters.ts'
import { BLOCK_FIELDS, file, SCENE_CARD, SCENE_DETAIL, toSceneCard, toSceneDetail } from './mappers.ts'

// --- queries --------------------------------------------------------------------

// Year of the earliest dated scene (bounds the age-at-filming filter).
export async function firstSceneYear(): Promise<number> {
  const d = await query<Pick<Query, 'findScenes'>>(
    `query { findScenes(filter: { per_page: 1, sort: "date", direction: ASC }, scene_filter: { date: { value: "1900-01-01", modifier: GREATER_THAN } }) { scenes { date } } }`,
    {},
    // not 'scene': every list waits on this, and an edit to one video (a rating, a tag) cannot
    // move the earliest date; a scan that adds videos refreshes it with everything else
    ['library'],
  )
  const y = Number(d.findScenes.scenes[0]?.date?.slice(0, 4))
  return Number.isFinite(y) && y > 1900 ? y : 1970
}

export async function findScenes(filter: FindFilterType, sceneFilter: SceneFilterType = {}) {
  const d = await query<Pick<Query, 'findScenes'>>(
    `query($f: FindFilterType, $s: SceneFilterType) {
      findScenes(filter: $f, scene_filter: $s) { count scenes { ${SCENE_CARD} } }
    }`,
    { f: filter, s: sceneFilter },
    ['scene', ...activityTags(filter, sceneFilter)],
  )
  return { total: d.findScenes.count, items: d.findScenes.scenes.map(toSceneCard) }
}

// Perceptual-hash duplicates for the workbench, grouped as Stash groups them. Every scene is
// included, blocked and hidden ones too: this is library hygiene, not browsing. Stash answers
// in well under a second for 2.2k scenes, so the normal data TTL (dropped on any scene change)
// is plenty.
export async function findDuplicateScenes(distance: number, durationDiff: number): Promise<DuplicateScene[][]> {
  const d = await query<Pick<Query, 'findDuplicateScenes'>>(
    `query($d: Int, $t: Float) {
      findDuplicateScenes(distance: $d, duration_diff: $t) { ${SCENE_CARD} files { video_codec bit_rate frame_rate } }
    }`,
    { d: distance, t: durationDiff },
    ['scene'],
  )
  return d.findDuplicateScenes.map((group) =>
    group.map((s) => {
      const f = file(s)
      return { ...toSceneCard(s), file: { path: f?.path ?? '', bitrate: f?.bit_rate ?? 0, videoCodec: f?.video_codec ?? '', framerate: f?.frame_rate ?? 0 } }
    }),
  )
}

// Which of these scene ids Stash still has, asked fresh (never from the cache): the ghost sweep
// removes flix's rows for the rest. Throws when Stash does not answer, so nothing is removed then.
export async function existingSceneIds(sceneIds: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  for (let i = 0; i < sceneIds.length; i += 500) {
    const d = await gql<Pick<Query, 'findScenes'>>(`query($ids: [ID!]) { findScenes(ids: $ids) { scenes { id } } }`, { ids: sceneIds.slice(i, i + 500) })
    for (const s of d.findScenes.scenes) found.add(s.id)
  }
  return found
}

// `blocked`: leave out what the blocklist and "Not interested" exclude (station resume points).
// Stash fails the whole call when one id is gone ("scene with id 3302 not found") instead of
// skipping it: a ranking or list cached before a delete then broke Featured with a 502
// (2026-11-09, after the snapshot restored a pre-delete ranking). Drop the missing id and ask again.
export async function findScenesByIds(sceneIds: string[], blocked?: Exclusions): Promise<SceneCard[]> {
  let ids = sceneIds
  let d: Pick<Query, 'findScenes'> | null = null
  while (!d) {
    if (!ids.length) return []
    try {
      d = await query<Pick<Query, 'findScenes'>>(
        `query($ids: [ID!]) { findScenes(ids: $ids) { scenes { ${SCENE_CARD} ${blocked ? BLOCK_FIELDS : ''} } } }`,
        { ids },
        ['scene'],
      )
    } catch (e) {
      const gone = missingSceneId(e)
      if (!gone || !ids.includes(gone)) throw e
      ids = ids.filter((id) => id !== gone)
    }
  }
  const scenes = blocked ? d.findScenes.scenes.filter((s) => !isBlocked(s, blocked)) : d.findScenes.scenes
  const byId = new Map<string, SceneCard>(scenes.map((s) => [s.id, toSceneCard(s)]))
  return sceneIds.map((id) => byId.get(id)).filter((s): s is SceneCard => !!s)
}

export const missingSceneId = (e: unknown): string | null => /scene with id (\d+) not found/.exec(e instanceof Error ? e.message : String(e))?.[1] ?? null

export async function getScene(id: string) {
  const d = await query<Pick<Query, 'findScene'>>(`query($id: ID!) { findScene(id: $id) { ${SCENE_DETAIL} } }`, { id }, ['scene', `scene:${id}`])
  if (!d.findScene) return null
  return {
    scene: toSceneDetail(d.findScene),
    group: groupFolder(file(d.findScene)?.path), // the studio's (or uploader's) folder, for related videos
    performerIds: d.findScene.performers.map((p) => p.id),
    studioId: d.findScene.studio?.id ?? null,
    parentStudioId: d.findScene.studio?.parent_studio?.id ?? null,
    tagIds: d.findScene.tags.map((t) => t.id),
    genders: d.findScene.performers.map((p) => p.gender ?? null), // for the Cast line
    marks: d.findScene as SceneMarks, // for unlistedReasons
  }
}

// Files are laid out <library>/<network>/<studio>/<date - title>/<file> (stash-library in the
// wiki), or <library>/<uploader>/<title>/<file> for a pack: a scene's own folder holds only it,
// the one above is its studio or uploader. That folder, or null when it would be the library
// itself (a file only two levels down).
export function groupFolder(path: string | undefined): string | null {
  const parts = path?.split('/').filter(Boolean) ?? []
  return parts.length >= 6 ? `/${parts.slice(0, -2).join('/')}` : null
}

// Stash path of a scene's primary file, for direct play from the NFS mount.
export async function sceneFilePath(id: string): Promise<string | null> {
  const d = await query<Pick<Query, 'findScene'>>(`query($id: ID!) { findScene(id: $id) { files { path } } }`, { id }, [`scene:${id}`])
  return d.findScene ? (file(d.findScene)?.path ?? null) : null
}

// Candidates share a performer or the studio; score favours performers, then studio,
// then tag overlap, then rating. A video with too few of those (nothing identified yet, a
// pack from one folder) is topped up from its own folder, then with unwatched videos, so
// the row is never empty.
const RELATED_MIN = 8 // fewer related videos than this and the row is topped up

export async function relatedScenes(
  id: string,
  performerIds: string[],
  studioId: string | null,
  tagIds: string[],
  blocked: Exclusions,
  group: string | null = null,
  // The source's Unlisted reasons (unlisted.ts relatedSide): a candidate that is Unlisted must
  // share all of its reasons. Null: the source is not Unlisted, so Stash leaves them out.
  allowed: Set<string> | null = null,
): Promise<SceneCard[]> {
  const fields = `${SCENE_CARD} ${BLOCK_FIELDS}`
  const queries: Promise<Pick<Query, 'findScenes'>>[] = []
  const ex: Exclusions = allowed ? { ...blocked, holdUnlisted: false } : { ...blocked, holdUnlisted: true }
  const fits = (s: Scene) => !allowed || !blocked.unlisted || withinReasons(unlistedReasons(s, blocked.unlisted), allowed)
  const notSelf = (f: SceneFilterType) => withExclusions({ ...f, id: { value: Number(id), modifier: 'NOT_EQUALS' } }, { ...ex })
  const run = (f: SceneFilterType) =>
    query<Pick<Query, 'findScenes'>>(`query($s: SceneFilterType) { findScenes(scene_filter: $s, filter: { per_page: 40, sort: "random_${daySeed()}" }) { scenes { ${fields} } } }`, {
      s: notSelf(f),
    }, ['scene', VOLATILE]) // 40 full cards each, three per video page: memory only, capped, not snapshotted
  if (performerIds.length) queries.push(run({ performers: { value: performerIds, modifier: 'INCLUDES' } }))
  if (studioId) queries.push(run({ studios: { value: [studioId], modifier: 'INCLUDES', depth: 0 } }))
  if (tagIds.length) queries.push(run({ tags: { value: tagIds.slice(0, 20), modifier: 'INCLUDES', depth: 0 } }))
  const results = await Promise.all(queries)
  const seen = new Map<string, Scene>()
  for (const r of results) for (const s of r.findScenes.scenes) if (fits(s)) seen.set(s.id, s)
  const tagSet = new Set(tagIds)
  const perfSet = new Set(performerIds)
  const score = (s: Scene) =>
    s.performers.filter((p) => perfSet.has(p.id)).length * 10 +
    (studioId && s.studio?.id === studioId ? 4 : 0) +
    s.tags.filter((t) => tagSet.has(t.id)).length * 0.25 +
    (s.rating100 ?? 50) / 100
  const ranked = [...seen.values()].sort((a, b) => score(b) - score(a)).slice(0, 24)
  for (const fallback of [
    // a regex: Stash's INCLUDES on a path matches loosely by words, almost the whole library
    group ? { path: { value: `^${group.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}/`, modifier: 'MATCHES_REGEX' } } : null,
    { play_count: { value: 0, modifier: 'EQUALS' } },
  ] as (SceneFilterType | null)[]) {
    if (ranked.length >= RELATED_MIN || !fallback) continue
    for (const s of (await run(fallback)).findScenes.scenes) {
      if (seen.has(s.id) || ranked.length >= 24 || !fits(s)) continue
      seen.set(s.id, s)
      ranked.push(s)
    }
  }
  return ranked.map(toSceneCard)
}
