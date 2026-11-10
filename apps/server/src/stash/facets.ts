import type { SceneFacets, SceneQuery, TagCard, TagTile } from '@flix/shared'
import { PINNED, VOLATILE } from '../cache/memory.ts'
import type { Query, Scene } from '../stash.schema.ts'
import { computed, query } from './client.ts'
import { findTags } from './entities.ts'
import { type Exclusions, findFilter, sceneFilter, unlistedReasons, withExclusions, withinReasons } from './filters.ts'
import { BLOCK_FIELDS, file, mediaUrl } from './mappers.ts'

// --- facets: what is inside a filtered set ---------------------------------------------------

// The quick choices (watched, rating, quality, length) are applied here rather than in Stash, so
// each choice group can be counted as if its own pick were not set; everything else filters in Stash.
const LOCAL_KEYS = ['unwatched', 'inProgress', 'minRating', 'minHeight', 'minDuration', 'maxDuration'] as const
type Local = Pick<SceneQuery, (typeof LOCAL_KEYS)[number]>

// Resolution as Stash buckets it, near enough: the short side, with some slack for odd encodes.
const RES_MIN: Record<number, number> = { 720: 700, 1080: 1000, 2160: 2000 }
const local = {
  watched: (s: Scene, q: Local) => (!q.unwatched || !s.play_count) && (!q.inProgress || (s.resume_time ?? 0) > 0),
  rating: (s: Scene, q: Local) => !q.minRating || (s.rating100 ?? 0) > q.minRating * 20 - 1,
  quality: (s: Scene, q: Local) => {
    if (!q.minHeight) return true
    const f = file(s)
    return !!f && Math.min(f.width, f.height) >= (RES_MIN[q.minHeight] ?? q.minHeight)
  },
  length: (s: Scene, q: Local) => {
    const d = file(s)?.duration ?? 0
    return (!q.minDuration || d > q.minDuration * 60) && (!q.maxDuration || d < q.maxDuration * 60)
  },
}
type Group = keyof typeof local
const groups = Object.keys(local) as Group[]
const passes = (s: Scene, q: Local, except?: Group) => groups.every((g) => g === except || local[g](s, q))

// Counts inside the set a query selects: per tag, performer and studio (a studio also counts its
// sub-studios' videos, as its filter does), and per quick choice.
//
// The answer (2–25 KB) is cached per filter set and exclusions under `facets` and snapshotted,
// so a deploy or an evicted working set no longer costs the 1–2 s rebuild on Filters; the raw
// scene dump behind it stays memory-only: PINNED for the unfiltered set every Browse opens,
// VOLATILE (capped) for the rest. Sort and paging do not change the counts and are left out of
// the key.
export async function sceneFacets(q: SceneQuery, blocked: Exclusions): Promise<SceneFacets> {
  const { sort: _sort, dir: _dir, page: _page, perPage: _perPage, seed: _seed, ...counted } = q
  return computed(['facets', counted, blocked], ['scene'], () => buildFacets(counted, blocked))
}

async function buildFacets(q: SceneQuery, blocked: Exclusions): Promise<SceneFacets> {
  const rest: SceneQuery = { ...q }
  for (const k of LOCAL_KEYS) delete rest[k]
  const s = sceneFilter(rest, blocked)
  const unfiltered = !q.q && JSON.stringify(s) === JSON.stringify(sceneFilter({}, blocked))
  const d = await query<Pick<Query, 'findScenes'>>(
    `query($f: FindFilterType, $s: SceneFilterType) { findScenes(filter: $f, scene_filter: $s) { scenes {
      play_count resume_time rating100 files { width height duration } tags { id } performers { id } studio { id parent_studio { id } }
    } } }`,
    { f: { ...findFilter({ q: q.q }), per_page: -1, sort: 'id' }, s },
    ['scene', unfiltered ? PINNED : VOLATILE], // hundreds of KB each: not worth the disk; stale after a play, not dropped
  )
  const all = d.findScenes.scenes
  const inSet = all.filter((s) => passes(s, q))
  const tally = (pick: (s: Scene) => string[]) => {
    const out: Record<string, number> = {}
    for (const s of inSet) for (const id of pick(s)) out[id] = (out[id] ?? 0) + 1
    return out
  }
  // each choice group: how many each of its options would give, with the other groups applied
  const option = (g: Group, opts: Record<string, Local>) => {
    const pool = all.filter((s) => passes(s, q, g))
    return Object.fromEntries(Object.entries(opts).map(([k, o]) => [k, pool.filter((s) => local[g](s, o)).length]))
  }
  return {
    total: inSet.length,
    tags: tally((s) => s.tags.map((t) => t.id)),
    performers: tally((s) => s.performers.map((p) => p.id)),
    studios: tally((s) => (s.studio ? [s.studio.id, ...(s.studio.parent_studio ? [s.studio.parent_studio.id] : [])] : [])),
    options: {
      watched: option('watched', { any: {}, unwatched: { unwatched: true }, inProgress: { inProgress: true } }),
      rating: option('rating', { any: {}, '3': { minRating: 3 }, '4': { minRating: 4 }, '4.5': { minRating: 4.5 } }),
      quality: option('quality', { any: {}, '720': { minHeight: 720 }, '1080': { minHeight: 1080 }, '2160': { minHeight: 2160 } }),
      length: option('length', { any: {}, short: { maxDuration: 15 }, mid: { minDuration: 15, maxDuration: 40 }, long: { minDuration: 40 } }),
    },
  }
}

// --- tag tiles ------------------------------------------------------------------------

// One representative screenshot per tag, from one query over the library: the best-rated,
// most-played scene carrying the tag that no bigger tag already used. The tiles (21 KB gz) are
// cached and snapshotted like the facets; the whole-library dump behind them is PINNED in memory (_capped at 3,000 scenes until 2026-11-09_).
export async function tagTiles(blocked: Exclusions): Promise<TagTile[]> {
  return computed(['tiles', blocked], ['scene', 'tag'], () => buildTiles(blocked))
}

async function buildTiles(blocked: Exclusions): Promise<TagTile[]> {
  const [scenesRaw, tagsRaw] = await Promise.all([
    query<Pick<Query, 'findScenes'>>(
      `query($s: SceneFilterType) { findScenes(scene_filter: $s, filter: { per_page: -1, sort: "rating", direction: DESC }) { scenes { id rating100 play_count paths { screenshot } ${BLOCK_FIELDS} } } }`,
      { s: withExclusions({}, { ...blocked }) },
      ['scene', PINNED],
    ),
    findTags({ per_page: 2000, sort: 'scenes_count', direction: 'DESC' }),
  ])
  const scenes = scenesRaw.findScenes.scenes
  const byTag = new Map<string, Scene[]>()
  for (const s of scenes) for (const t of s.tags) (byTag.get(t.id) ?? byTag.set(t.id, []).get(t.id)!).push(s)
  const rank = (s: Scene) => (s.rating100 ?? 50) + Math.min(s.play_count ?? 0, 10) * 3
  const used = new Set<string>()
  // A category's picture comes from a video that is Unlisted for no reason the category does not
  // share: an Unlisted category shows its own videos, any other avoids Unlisted ones.
  const u = blocked.unlisted
  const fits = (s: Scene, t: string) => !u || withinReasons(unlistedReasons(s, u), new Set(u.tags.includes(t) ? [`tag:${t}`] : []))
  return tagsRaw.items.map((t: TagCard) => {
    const pool = (byTag.get(t.id) ?? []).filter((s) => fits(s, t.id)).sort((a, b) => rank(b) - rank(a))
    const pick = pool.find((s) => !used.has(s.id)) ?? pool[0]
    if (pick) used.add(pick.id)
    return { id: t.id, name: t.name, sceneCount: t.sceneCount, favorite: t.favorite, image: pick ? mediaUrl(pick.paths.screenshot) : null }
  })
}
