import type { HistoryEntry, Ref, SceneCard, Stats } from '@flix/shared'
import type { Query, Scene, SceneFilterType } from '../stash.schema.ts'
import { daySeed, mutate, query } from './client.ts'
import { type Exclusions, isBlocked, type UnlistedSets, unlistedReasons, withExclusions } from './filters.ts'
import { BLOCK_FIELDS, ref, SCENE_CARD, toSceneCard } from './mappers.ts'

// --- activity: history, stats, recommendations ---------------------------------------

// Every scene you have touched: played, rated or O'd. One cached query feeds history,
// stats and "For you". Tag sizes (for weighting rare tags) come from tagSceneCounts: asked
// here as `tags { scene_count }`, Stash counted every tag's scenes for every scene, 0.5 of the
// query's 0.6 s (2026-10-31).
async function activityScenes(): Promise<Scene[]> {
  const d = await query<Pick<Query, 'findScenes'>>(
    `query { findScenes(
      filter: { per_page: -1, sort: "last_played_at", direction: DESC },
      scene_filter: {
        play_count: { value: 0, modifier: GREATER_THAN },
        OR: { rating100: { value: 0, modifier: GREATER_THAN }, OR: { o_counter: { value: 0, modifier: GREATER_THAN } } }
      }
    ) { scenes { ${SCENE_CARD} ${BLOCK_FIELDS} play_duration play_history performers { gender image_path } tags { id name } } } }`,
    {},
    ['scene', 'activity:play'],
  )
  return d.findScenes.scenes
}

const weight = (s: Scene) => (s.play_count ?? 0) + 2 * (s.o_counter ?? 0) + (s.rating100 ? (s.rating100 / 20 - 3) * 1.5 : 0)

// Every play, one entry per video per day (`tz`: the browser's getTimezoneOffset(), minutes), newest
// first, a page at a time. _Until 2026-11-09_ every play was its own row, the newest 300 only.
export async function history(page: number, perPage: number, tz: number, blocked?: Exclusions): Promise<{ items: HistoryEntry[]; total: number }> {
  const scenes = (await activityScenes()).filter((s) => !blocked || !isBlocked(s, blocked))
  return groupHistory(scenes.map((s) => ({ card: toSceneCard(s), times: s.play_history ?? [] })), tz, page, perPage)
}

export function groupHistory(scenes: { card: SceneCard; times: string[] }[], tz: number, page: number, perPage: number): { items: HistoryEntry[]; total: number } {
  const all: HistoryEntry[] = []
  for (const { card, times } of scenes) {
    const days = new Map<string, string[]>()
    for (const t of times) {
      const ms = Date.parse(t)
      if (Number.isNaN(ms)) continue
      const day = new Date(ms - tz * 60_000).toISOString().slice(0, 10)
      days.set(day, [...(days.get(day) ?? []), t])
    }
    for (const [day, ts] of days) {
      ts.sort((a, b) => Date.parse(b) - Date.parse(a))
      all.push({ playedAt: ts[0], day, times: ts, scene: card })
    }
  }
  all.sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt))
  return { items: all.slice((page - 1) * perPage, page * perPage), total: all.length }
}

// The last video played, for "Because you watched": the touched scenes come newest play first,
// so this is the first played one that is not blocked (_until 2026-11-09 every Home build turned
// every play event of every touched video into a card and sorted them to find it_).
export async function lastPlayed(blocked?: Exclusions): Promise<{ id: string; title: string } | null> {
  const s = (await activityScenes()).find((s) => s.last_played_at && (!blocked || !isBlocked(s, blocked)))
  return s ? { id: s.id, title: toSceneCard(s).title } : null
}

// History's remove and its Undo: exactly these plays out of (or back into) Stash's play history;
// the play count follows, the resume point and play time stay. Like a play, it drops the scene's
// own queries and the activity ones and leaves the lists stale (_until 2026-11-09 it reset the
// play count and resume point and dropped every 'scene' query_).
export async function deletePlays(id: string, times: string[]) {
  await mutate(`mutation($id: ID!, $t: [Timestamp!]) { sceneDeletePlay(id: $id, times: $t) { count } }`, { id, t: times }, [`scene:${id}`, 'activity:play'], ['scene'])
}
export async function addPlays(id: string, times: string[]) {
  await mutate(`mutation($id: ID!, $t: [Timestamp!]) { sceneAddPlay(id: $id, times: $t) { count } }`, { id, t: times }, [`scene:${id}`, 'activity:play'], ['scene'])
}

export async function stats(blocked?: Exclusions): Promise<Stats> {
  const scenes = (await activityScenes()).filter((s) => !blocked || !isBlocked(s, blocked))
  const tally = () => new Map<string, { ref: Ref; plays: number }>()
  const perf = tally()
  const studios = tally()
  const tags = tally()
  const add = (m: ReturnType<typeof tally>, ref: Ref, n: number) => {
    const e = m.get(ref.id) ?? { ref, plays: 0 }
    e.plays += n
    m.set(ref.id, e)
  }
  const days = new Map<string, number>()
  const since = Date.now() - 30 * 86_400_000
  let plays = 0
  let seconds = 0
  let o = 0
  let watched = 0
  for (const s of scenes) {
    const n = s.play_count ?? 0
    plays += n
    seconds += s.play_duration ?? 0
    o += s.o_counter ?? 0
    if (n) watched++
    if (!n) continue
    s.performers.forEach((p) => add(perf, ref(p), n))
    if (s.studio) add(studios, ref(s.studio), n)
    s.tags.forEach((t) => add(tags, { id: t.id, name: t.name }, n))
    for (const t of s.play_history ?? []) {
      const at = new Date(t)
      if (at.getTime() < since) continue
      const day = at.toISOString().slice(0, 10)
      days.set(day, (days.get(day) ?? 0) + 1)
    }
  }
  const top = (m: ReturnType<typeof tally>, n: number) => [...m.values()].sort((a, b) => b.plays - a.plays).slice(0, n)
  const perDay = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10)
    return { date, plays: days.get(date) ?? 0 }
  })
  return {
    plays,
    hours: Math.round((seconds / 3600) * 10) / 10,
    scenesWatched: watched,
    oCount: o,
    topPerformers: top(perf, 10),
    topStudios: top(studios, 5),
    topTags: top(tags, 15),
    perDay,
  }
}

// Affinity from what you watched, rated and O'd; tags are weighted by rarity so that
// near-universal tags do not drown out distinctive ones.
export interface Affinities {
  performers: Map<string, { ref: Ref; w: number; gender: string | null }>
  studios: Map<string, number>
  tags: Map<string, number>
}

// How much each performer, studio and tag figures in what you watched, rated and O'd.
// How many scenes carry each tag, all tags in one query (0.14 s for ~1,100 tags). Only weights
// "For you" and Featured, so it may lag a tag edit until Stash next reports a change.
async function tagSceneCounts(): Promise<Map<string, number>> {
  const d = await query<Pick<Query, 'findTags'>>(`{ findTags(filter: { per_page: -1 }) { tags { id scene_count } } }`, {}, ['library'])
  return new Map(d.findTags.tags.map((t) => [t.id, t.scene_count ?? 0]))
}

// `skip`: Unlisted scenes teach nothing about taste here (wiki features/vault).
export async function affinities(skip: UnlistedSets | null = null): Promise<Affinities | null> {
  const [all, tagCounts] = await Promise.all([activityScenes(), tagSceneCounts()])
  const scenes = skip ? all.filter((s) => !unlistedReasons(s, skip).size) : all
  if (!scenes.length) return null
  const totalRaw = await query<Pick<Query, 'findScenes'>>(`{ findScenes(filter: { per_page: 0 }) { count } }`, {}, ['scene'])
  const total = totalRaw.findScenes.count
  const pAff: Affinities['performers'] = new Map()
  const sAff = new Map<string, number>()
  const tAff = new Map<string, number>()
  for (const s of scenes) {
    const w = weight(s)
    if (w <= 0) continue
    s.performers.forEach((p) => {
      const e = pAff.get(p.id) ?? { ref: ref(p), w: 0, gender: p.gender ?? null }
      e.w += w
      pAff.set(p.id, e)
    })
    if (s.studio) sAff.set(s.studio.id, (sAff.get(s.studio.id) ?? 0) + w)
    s.tags.forEach((t) => tAff.set(t.id, (tAff.get(t.id) ?? 0) + w * Math.log(1 + total / Math.max(1, tagCounts.get(t.id) ?? 1))))
  }
  return { performers: pAff, studios: sAff, tags: tAff }
}

export async function recommendations(blocked: Exclusions) {
  const aff = await affinities(blocked.holdUnlisted ? (blocked.unlisted ?? null) : null)
  if (!aff) return null
  const { performers: pAff, studios: sAff, tags: tAff } = aff
  const topIds = <T,>(m: Map<string, T>, val: (v: T) => number, n: number) =>
    [...m.entries()].sort((a, b) => val(b[1]) - val(a[1])).slice(0, n).map(([k]) => k)
  const topPerf = topIds(pAff, (v) => v.w, 8)
  const topStudios = topIds(sAff, (v) => v, 3)
  const topTags = topIds(tAff, (v) => v, 6)

  const fields = `${SCENE_CARD} tags { id }`
  const run = (f: SceneFilterType) =>
    query<Pick<Query, 'findScenes'>>(
      `query($s: SceneFilterType) { findScenes(scene_filter: $s, filter: { per_page: 60, sort: "random_${daySeed()}" }) { scenes { ${fields} } } }`,
      { s: withExclusions({ ...f, play_count: { value: 0, modifier: 'EQUALS' } }, { ...blocked }) },
      ['scene', 'activity:play'],
    )
  const results = await Promise.all([
    topPerf.length ? run({ performers: { value: topPerf, modifier: 'INCLUDES' } }) : null,
    topStudios.length ? run({ studios: { value: topStudios, modifier: 'INCLUDES', depth: 0 } }) : null,
    topTags.length ? run({ tags: { value: topTags, modifier: 'INCLUDES', depth: 0 } }) : null,
  ])
  const cands = new Map<string, Scene>()
  for (const r of results) for (const s of r?.findScenes.scenes ?? []) cands.set(s.id, s)
  const score = (s: Scene) =>
    s.performers.reduce((a, p) => a + (pAff.get(p.id)?.w ?? 0), 0) +
    (s.studio ? (sAff.get(s.studio.id) ?? 0) * 0.5 : 0) +
    s.tags.reduce((a, t) => a + (tAff.get(t.id) ?? 0) * 0.1, 0)
  const forYou = [...cands.values()].sort((a, b) => score(b) - score(a)).slice(0, 24).map(toSceneCard)

  // "More with …" for the two performers you return to most.
  const favPerformers = topPerf
    .map((id) => pAff.get(id)!)
    .filter((p) => !blocked.performers.includes(p.ref.id) && !(blocked.holdUnlisted && blocked.unlisted?.performers.includes(p.ref.id)))
    .slice(0, 2)
    .map((p) => p.ref)
  return { forYou, favPerformers }
}
