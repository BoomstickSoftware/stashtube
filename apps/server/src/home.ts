// The home feed and the Featured row: assembled here from the stash layer's reads, cached per
// visit seed.
import type { FeaturedWeights, HomeRow, SceneCard, SceneQuery } from '@flix/shared'
import { exclusions } from './blocklist.ts'
import { dataCache, HOME, HOME_TTL, POOL } from './cache/data.ts'
import { NO_AFFINITY, rankFeatured, type Affinity } from './featured.ts'
import * as savedRows from './rows.ts'
import { getSettings } from './settings.ts'
import * as stash from './stash.ts'
import { daySeed } from './stash.ts'
import { curated, relatedSide } from './unlisted.ts'

// The ranking for a seed and dials, cached: the first RANK_BUCKET ids (more in steps of it as the
// hero pages further), so a new seed is ranked once and the hero's next pages, a Back to Home and
// a Settings preview at the same dials are lookups. Tagged with the pool, so any write that can move
// a score expires it (served stale while it re-ranks). _Until 2026-11-09_ every call re-ranked the
// whole library (31–39 ms, the slowest warm route), the hero's pages included.
const RANK_BUCKET = 100
// A browser keeps its seed 5 min (an hour while it keeps coming back), so per-seed answers are
// kept stale only that long, not the cache-wide week (108 KB a feed, ~12 seeds an hour).
const VISIT_STALE = 2 * 3_600_000
async function featuredRanking(weights: FeaturedWeights, seed: string, upTo: number): Promise<{ id: string; why: string }[]> {
  const blocked = curated(await exclusions())
  const n = Math.ceil(upTo / RANK_BUCKET) * RANK_BUCKET
  const key = JSON.stringify(['featured-rank', seed, weights, blocked, n], (_k, v: unknown) => (v instanceof Set ? [...v] : v)) // Unlisted sets
  return dataCache.get(key, 10 * 60_000, [POOL], async () => {
    const [candidates, aff] = await Promise.all([stash.featuredCandidates(blocked), stash.affinities(blocked.unlisted ?? null)])
    const affinity: Affinity = aff
      ? { performers: new Map([...aff.performers].map(([id, p]) => [id, p.w])), studios: aff.studios, tags: aff.tags }
      : NO_AFFINITY
    return rankFeatured(candidates, affinity, weights, seed, n).map((r) => ({ id: r.card.id, why: r.why }))
  }, { staleFor: VISIT_STALE })
}

// The Featured row: the library scored by the saved (or given) dials, for this seed.
export async function featured(weights: FeaturedWeights, seed: string, limit: number, offset = 0): Promise<SceneCard[]> {
  const ranked = (await featuredRanking(weights, seed, limit + offset)).slice(offset, offset + limit)
  // the pool carries only what scoring needs; the winners get their full cards
  const cards = new Map((await stash.findScenesByIds(ranked.map((r) => r.id))).map((s) => [s.id, s]))
  return ranked.flatMap((r) => {
    const card = cards.get(r.id)
    return card ? [{ ...card, why: r.why }] : []
  })
}

// Related videos of the last one played, unwatched ones first.
async function becauseYouWatched(blocked: Awaited<ReturnType<typeof exclusions>>): Promise<HomeRow | null> {
  const last = await stash.lastPlayed(blocked)
  if (!last) return null
  const r = await stash.getScene(last.id)
  if (!r) return null
  const related = await stash.relatedScenes(last.id, r.performerIds, r.studioId, r.tagIds, blocked, null, relatedSide(r.marks, blocked))
  const items = [...related.filter((s) => !s.playCount), ...related.filter((s) => s.playCount)].slice(0, 24)
  if (items.length < 3) return null
  const title = last.title.length > 48 ? `${last.title.slice(0, 46).trimEnd()}…` : last.title
  return { key: 'because', title: `Because you watched ${title}`, from: last.id, items }
}

// The home feed. Also run at startup and after Stash changes, so the first visit is warm. The
// finished rows are cached per visit seed (5 min, then served stale while they rebuild), so the
// refetch the page makes on every return to the foreground is a lookup, not a 40 ms assembly
// (2026-10-31); the rows' own tags leave it stale after a play or an edit, and a pinned-row,
// settings or blocklist write drops it (HOME). Its loader's reads wait for their refresh
// (`freshInputs`), so a stale row is never re-stored as a fresh feed.
// A play or a progress save only expires it (through `scene`): the old feed keeps answering at
// once while one rebuild runs, then the new one takes its place (_until 2026-11-09 it also carried
// `activity:play` and `activity:resume`, so every 15 s progress save deleted it and the next Home
// waited 0.7–1.9 s for a cold build_). After a play the feed for the last seed asked for is rebuilt
// in the background, so going back to Home finds the swap already done.
export function homeRows(visitSeed = String(daySeed())): Promise<HomeRow[]> {
  return dataCache.get(JSON.stringify([HOME, visitSeed]), HOME_TTL, [HOME, 'scene', 'performer', 'studio', POOL], () => buildHomeRows(visitSeed), {
    freshInputs: true,
    staleFor: VISIT_STALE,
  })
}

// The seed of the last feed a page asked for: the one rebuilt after a play.
let lastHomeSeed: string | undefined
export const noteHomeSeed = (seed: string) => (lastHomeSeed = seed)
let rebuildTimer: NodeJS.Timeout | null = null
export function rebuildHomeSoon() {
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null
    homeRows(lastHomeSeed).catch(() => {}) // a stale hit starts the background rebuild
  }, 5_000)
  rebuildTimer.unref()
}

async function buildHomeRows(visitSeed: string): Promise<HomeRow[]> {
  // Unlisted videos stay off Home; a pinned row that names an Unlisted entity still shows its own
  const blocked = curated(await exclusions())
  const row = async (key: string, title: string, query: SceneQuery): Promise<HomeRow> => {
    const f = query.sort === 'random' && !query.seed ? { ...query, seed: daySeed() } : query
    const r = await stash.findScenes(stash.findFilter({ ...f, perPage: 24 }), stash.sceneFilter(f, blocked))
    return { key, title, browse: f, items: r.items }
  }
  const seed = daySeed()
  const settings = await getSettings()
  const failed = (what: string) => (e: Error) => {
    console.error(`${what}:`, e.message)
    return null
  }
  // The groups that do not depend on each other run together (a cold feed waited on each in
  // turn); only "More with" needs the recommendations' favourite performers.
  const recsP = stash.recommendations(blocked).catch(failed('recommendations'))
  const [recs, picks, because, pinnedRows, moreWith, rows] = await Promise.all([
    recsP,
    featured(settings.featured, visitSeed, 24).catch(failed('featured')),
    becauseYouWatched(blocked).catch(failed('because you watched')),
    savedRows.listRows().then((pinned) => Promise.all(pinned.map(async (r) => ({ ...(await row(`saved-${r.id}`, r.title, r.query)), savedId: r.id })))),
    recsP.then((r) =>
      Promise.all((r?.favPerformers ?? []).map((p) => row(`more-${p.id}`, `More with ${p.name}`, { performers: p.id, sort: 'random', seed }))),
    ),
    Promise.all([
      row('favorites', 'New from performers you follow', { favorites: true, sort: 'date' }),
      row('recent', 'Recently added', { sort: 'created_at' }),
      row('discover', 'Discover', { sort: 'random', seed, unwatched: true }),
      row('top', 'Top rated', { sort: 'rating', minRating: 4 }),
      row('releases', 'Latest releases', { sort: 'date' }),
      row('most', 'Most watched', { sort: 'play_count' }),
    ]),
  ])
  const personal: HomeRow[] = []
  if (picks?.length) personal.push({ key: 'featured', title: 'Featured', items: picks })
  if (recs?.forYou.length) personal.push({ key: 'for-you', title: 'For you', browse: { unwatched: true }, items: recs.forYou })
  if (because) personal.push(because)
  // A shelf of one or two looks broken; pinned rows always show (even empty) so they can be managed.
  return [...personal, ...pinnedRows, ...moreWith, ...rows].filter((r) => r.savedId || r.items.length >= 3)
}

// Pinned rows are part of the cached feed; every change to them drops it.
export const homeChanged = () => dataCache.invalidate(HOME)
