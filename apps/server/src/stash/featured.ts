import { POOL } from '../cache/data.ts'
import type { Candidate } from '../featured.ts'
import type { Query, Scene } from '../stash.schema.ts'
import { memoBy, query } from './client.ts'
import { type Exclusions, withExclusions } from './filters.ts'
import { toSceneCard } from './mappers.ts'

// --- featured -------------------------------------------------------------------------

// Everything the Featured engine scores: the whole library (minus exclusions) with the card
// fields plus what the signals read. One query, cached like the rest but kept out of the
// saved cache (it is the biggest result flix holds and is cheap to refetch).
// Only what the Featured scoring reads, for the whole library: with the card fields (files,
// paths, names) it took 2.3 s and ~7 MB on the N5105, without them 0.8 s and 2.3 MB
// (2026-10-31); the 24 that win get their cards from findScenesByIds.
//
// Tagged POOL rather than 'scene' / 'activity:play': a play or an edit marks it stale instead
// of dropping it (see mutate), so Home after watching something answers from the old pool at
// once while it refreshes, instead of waiting for a whole-library query. Not VOLATILE: at
// 2.3 MB it goes into the snapshot, so a restart (every deploy) starts with it.
async function featuredPool(blocked: Exclusions): Promise<Scene[]> {
  const d = await query<Pick<Query, 'findScenes'>>(
    `query($s: SceneFilterType) { findScenes(scene_filter: $s, filter: { per_page: -1, sort: "created_at", direction: DESC }) {
      scenes { id created_at last_played_at play_count o_counter rating100 tags { id favorite } scene_markers { id } performers { id favorite } studio { id favorite } }
    } }`,
    { s: withExclusions({}, { ...blocked }) },
    [POOL],
  )
  return d.findScenes.scenes
}

const toCandidate = (s: Scene): Candidate => ({
  card: toSceneCard(s),
  performerIds: s.performers.map((p) => p.id),
  studioId: s.studio?.id ?? null,
  tagIds: s.tags.map((t) => t.id),
  favPerformer: s.performers.some((p) => p.favorite),
  favStudio: !!s.studio?.favorite,
  favTag: s.tags.some((t) => t.favorite),
  markers: s.scene_markers?.length ?? 0,
  rating100: s.rating100 ?? null,
})

// The pool as ranking candidates, built once per fetched pool rather than on every call.
const candidatesOf = memoBy((pool: Scene[]) => pool.map(toCandidate))
export const featuredCandidates = async (blocked: Exclusions): Promise<Candidate[]> => candidatesOf(await featuredPool(blocked))
