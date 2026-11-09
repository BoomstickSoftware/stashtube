import type { SdbSceneDetails, DeleteResult, Duplicates, Features, FeaturedWeights, HomeRow, Page, SceneCard, SceneDetail, SceneQuery, SearchResult } from '@flix/shared'
import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { block, blocklist, exclusions, unblock } from './blocklist.ts'
import { castStatus, sceneCast, setOverride, syncCast } from './cast.ts'
import { curated, dropUnlistedWanted, relatedSide, relist, unlist, unlistedList } from './unlisted.ts'
import { config } from './config.ts'
import { deleteScene } from './delete.ts'
import { toGroup } from './duplicates.ts'
import { NO_AFFINITY, rankFeatured, sanitizeWeights, type Affinity, type Candidate } from './featured.ts'
import * as pl from './playlists.ts'
import * as savedRows from './rows.ts'
import * as stations from './stations.ts'
import * as stashdb from './stashdb.ts'
import * as whisparr from './whisparr.ts'
import { kickSync, rememberGet, runSync, syncStatus } from './sync.ts'
import * as catalog from './catalog.ts'
import * as cleanup from './cleanup.ts'
import * as getq from './getqueue.ts'
import { genderCriterion, getSettings, setSetting } from './settings.ts'
import * as stash from './stash.ts'
import { dataCache, daySeed, HOME, HOME_TTL, POOL } from './stash.ts'
import type { Scene } from './stash.schema.ts'

export const api = new Hono()

const num = z.coerce.number().int().positive().optional()
// Query strings send '1'/'true'; JSON bodies (pinned rows) send real booleans.
const flag = z
  .union([z.boolean(), z.enum(['1', 'true', '0', 'false']).transform((v) => v === '1' || v === 'true')])
  .optional()
const list = z.string().regex(/^[\d,]*$/).optional()

const sceneQuery = z.object({
  q: z.string().max(200).optional(),
  sort: z.enum(['date', 'created_at', 'rating', 'play_count', 'last_played_at', 'o_counter', 'duration', 'title', 'random']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  page: num,
  perPage: z.coerce.number().int().min(1).max(120).optional(),
  seed: num,
  tags: list,
  xtags: list,
  performers: list,
  studios: list,
  minRating: z.coerce.number().min(0).max(5).optional(),
  minHeight: num,
  minDuration: num,
  maxDuration: num,
  unwatched: flag,
  inProgress: flag,
  favorites: flag,
  unblocked: flag,
  vault: flag,
  noUnlisted: flag,
  maxHeight: num,
  maxRating: z.coerce.number().min(1).max(5).optional(),
  unmatched: flag,
  olderDays: num,
  duplicates: flag,
  minAge: z.coerce.number().int().min(18).max(99).optional(),
  maxAge: z.coerce.number().int().min(18).max(99).optional(),
  ethnicities: z.string().max(200).regex(/^[A-Za-z ,]*$/).optional(),
}) satisfies z.ZodType<SceneQuery>

const people = z
  .object({
    minAge: z.number().int().min(18).max(99).optional(),
    maxAge: z.number().int().min(18).max(99).optional(),
    ethnicities: z.array(z.string().max(40)).max(20).optional(),
  })
  // a reversed range would be saved and applied to every list, emptying the library
  .refine((p) => p.minAge == null || p.maxAge == null || p.minAge <= p.maxAge, { message: 'minimum age is above the maximum' })

const listQuery = z.object({
  q: z.string().max(200).optional(),
  sort: z.enum(['name', 'scenes_count', 'rating', 'created_at', 'random']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  page: num,
  perPage: z.coerce.number().int().min(1).max(1000).optional(),
  seed: num,
  favorites: flag,
  unblocked: flag,
  gender: z.enum(['women', 'men', 'all']).optional(), // the Performers page only; everyone when absent
})

const parse = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T> => {
  const r = schema.safeParse(data)
  if (!r.success) throw new HTTPException(400, { message: z.prettifyError(r.error) })
  return r.data
}

const notFound = () => {
  throw new HTTPException(404, { message: 'not found' })
}


// --- scenes ---------------------------------------------------------------------

api.get('/scenes', async (c) => {
  const q = parse(sceneQuery, c.req.query())
  const blocked = await exclusions()
  const page = q.page ?? 1
  const perPage = q.perPage ?? 40
  const r = await stash.findScenes(
    stash.findFilter({ ...q, sort: q.sort ?? (q.q ? undefined : 'date'), page, perPage }),
    stash.sceneFilter(q, blocked),
  )
  return c.json({ ...r, page, perPage } satisfies Page<unknown>)
})

// Counts inside a filtered set, for the filter panel (registered before /scenes/:id).
api.get('/scenes/facets', async (c) => c.json(await stash.sceneFacets(parse(sceneQuery, c.req.query()), await exclusions())))

// Videos marked "Not interested" (registered before /scenes/:id).
api.get('/scenes/hidden', async (c) => c.json(await stash.hiddenScenes()))

api.get('/home', async (c) => {
  lastHomeSeed = seedParam(c.req.query('seed'))
  return c.json(await homeRows(lastHomeSeed))
})

// --- duplicates -----------------------------------------------------------------

// Stash's phash groups with the copy to keep chosen (duplicates.ts). Includes blocked and
// hidden videos: this is library hygiene, like /cleanup.
const duplicatesQuery = z.object({
  distance: z.coerce.number().int().min(0).max(16).default(0),
  durationDiff: z.coerce.number().min(-1).default(-1),
})
api.get('/duplicates', async (c) => {
  const q = parse(duplicatesQuery, c.req.query())
  const groups = await stash.findDuplicateScenes(q.distance, q.durationDiff)
  return c.json<Duplicates>({ ...q, groups: groups.map(toGroup) })
})

// --- featured -------------------------------------------------------------------

// The page sends one seed per visit; anything else (the warm, curl) gets today's.
const seedParam = (s: string | undefined) => (s && /^[\w-]{1,40}$/.test(s) ? s : String(daySeed()))
const limitParam = (s: string | undefined) => Math.min(60, Math.max(1, Number(s) || 24))
const offsetParam = (s: string | undefined) => Math.min(5000, Math.max(0, Math.floor(Number(s) || 0))) // the hero pages down the same ranking
const weightsBody = z.object(Object.fromEntries(['dormant', 'shelfAge', 'fresh', 'performer', 'tag', 'studio', 'watched', 'marked', 'rated', 'oCount', 'surprise'].map((k) => [k, z.number().min(-1).max(1)])) as Record<keyof FeaturedWeights, z.ZodNumber>).partial()

const toCandidate = (s: Scene): Candidate => ({
  card: stash.toSceneCard(s),
  performerIds: s.performers.map((p) => p.id),
  studioId: s.studio?.id ?? null,
  tagIds: s.tags.map((t) => t.id),
  favPerformer: s.performers.some((p) => p.favorite),
  favStudio: !!s.studio?.favorite,
  favTag: s.tags.some((t) => t.favorite),
  markers: s.scene_markers?.length ?? 0,
  rating100: s.rating100 ?? null,
})

// The Featured row: the library scored by the saved (or given) dials, for this seed.
async function featured(weights: FeaturedWeights, seed: string, limit: number, offset = 0): Promise<SceneCard[]> {
  const blocked = curated(await exclusions())
  const [pool, aff] = await Promise.all([stash.featuredPool(blocked), stash.affinities(blocked.unlisted ?? null)])
  const affinity: Affinity = aff
    ? { performers: new Map([...aff.performers].map(([id, p]) => [id, p.w])), studios: aff.studios, tags: aff.tags }
    : NO_AFFINITY
  const ranked = rankFeatured(pool.map(toCandidate), affinity, weights, seed, limit + offset).slice(offset)
  // the pool carries only what scoring needs; the winners get their full cards
  const cards = new Map((await stash.findScenesByIds(ranked.map((r) => r.card.id))).map((s) => [s.id, s]))
  return ranked.flatMap((r) => {
    const card = cards.get(r.card.id)
    return card ? [{ ...card, why: r.why }] : []
  })
}

api.get('/featured', async (c) =>
  c.json(await featured((await getSettings()).featured, seedParam(c.req.query('seed')), limitParam(c.req.query('limit')), offsetParam(c.req.query('offset')))),
)

// Settings' live preview: score with dials that are not saved (yet).
api.post('/featured/preview', async (c) => {
  const b = parse(z.object({ weights: weightsBody, seed: z.string().optional(), limit: z.number().optional() }), await c.req.json())
  const weights = sanitizeWeights(b.weights, (await getSettings()).featured)
  return c.json(await featured(weights, seedParam(b.seed), limitParam(b.limit == null ? undefined : String(b.limit))))
})

// Related videos of the last one played, unwatched ones first.
async function becauseYouWatched(blocked: Awaited<ReturnType<typeof exclusions>>): Promise<HomeRow | null> {
  const last = (await stash.history(1, blocked))[0]?.scene
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
  })
}

let lastHomeSeed: string | undefined
let rebuildTimer: NodeJS.Timeout | null = null
function rebuildHomeSoon() {
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

// --- pinned rows ---------------------------------------------------------------

const rowBody = z.object({ title: z.string().trim().min(1).max(80), query: sceneQuery })
const rid = (s: string) => parse(z.coerce.number().int().positive(), s)
// Pinned rows are part of the cached feed; every change to them drops it.
const homeChanged = () => dataCache.invalidate(HOME)

api.get('/rows', async (c) => c.json(await savedRows.listRows()))
api.post('/rows', async (c) => {
  const b = parse(rowBody, await c.req.json())
  const id = await savedRows.addRow(b.title, b.query)
  homeChanged()
  return c.json({ id }, 201)
})
api.put('/rows/order', async (c) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int()).max(100) }), await c.req.json())
  await savedRows.reorderRows(ids)
  homeChanged()
  return c.body(null, 204)
})
api.put('/rows/:id', async (c) => {
  const { title } = parse(rowBody.pick({ title: true }), await c.req.json())
  await savedRows.renameRow(rid(c.req.param('id')), title)
  homeChanged()
  return c.body(null, 204)
})
api.delete('/rows/:id', async (c) => {
  await savedRows.deleteRow(rid(c.req.param('id')))
  homeChanged()
  return c.body(null, 204)
})

// --- stations ----------------------------------------------------------------------

const stationBody = z.object({
  name: z.string().trim().min(1).max(80),
  query: sceneQuery,
  from: z.string().regex(/^\d+$/).optional(),
  mode: z.enum(['full', 'moments']),
  window: z.number().int().min(10).max(600),
})

api.get('/stations', async (c) => c.json(await stations.listStations()))
// Every station card's pictures and count in one answer. `day` seeds the shuffle; each `q` is
// an ad hoc query (the quick-start cards) as JSON, answered under that same string.
api.get('/stations/previews', async (c) => {
  const day = parse(z.coerce.number().int().nonnegative(), c.req.query('day') ?? 0)
  const json = (s: string) => {
    try {
      return JSON.parse(s) as unknown
    } catch {
      return undefined
    }
  }
  const queries = (c.req.queries('q') ?? []).slice(0, 12).map((key) => ({ key, query: parse(sceneQuery, json(key)) }))
  return c.json(await stations.previews(day, queries))
})
api.get('/stations/resume', async (c) => c.json(await stations.listResume()))
api.put('/stations/resume', async (c) => {
  const b = parse(
    z.object({ key: z.string().min(3).max(2000), sceneId: z.string().regex(/^\d+$/), seconds: z.number().min(0).max(86_400) }),
    await c.req.json(),
  )
  await stations.saveResume(b.key, b.sceneId, b.seconds)
  return c.body(null, 204)
})
api.post('/stations', async (c) => {
  const b = parse(stationBody, await c.req.json())
  return c.json({ id: await stations.addStation(b) }, 201)
})
api.put('/stations/order', async (c) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int()).max(200) }), await c.req.json())
  await stations.reorderStations(ids)
  return c.body(null, 204)
})
api.put('/stations/:id', async (c) => {
  const b = parse(stationBody.omit({ from: true }).partial(), await c.req.json())
  await stations.updateStation(rid(c.req.param('id')), b)
  return c.body(null, 204)
})
api.delete('/stations/:id', async (c) => {
  await stations.deleteStation(rid(c.req.param('id')))
  return c.body(null, 204)
})

// --- history and stats -------------------------------------------------------------

api.get('/history', async (c) => c.json(await stash.history(undefined, await exclusions())))
api.delete('/history/:id', async (c) => {
  await stash.removeFromHistory(sceneId(c.req.param('id')))
  return c.body(null, 204)
})
api.get('/stats', async (c) => c.json(await stash.stats(await exclusions())))

api.get('/scenes/:id', async (c) => {
  const id = c.req.param('id')
  const r = await stash.getScene(id)
  if (!r) return notFound()
  const [hidden, u, cast] = await Promise.all([stash.hiddenTag(), unlistedList(), sceneCast(r.scene.id, r.genders)])
  // what keeps it off Home besides a hand unlist, named for the scene page's notice
  const via = [
    ...u.tags.filter((t) => r.tagIds.includes(t.id)),
    ...u.performers.filter((p) => r.performerIds.includes(p.id)),
    ...u.studios.filter((s) => s.id === r.studioId || s.id === r.marks.studio?.parent_studio?.id),
  ]
  return c.json({
    ...r.scene,
    hidden: !!hidden && r.tagIds.includes(hidden),
    unlisted: !!u.sceneTag && r.tagIds.includes(u.sceneTag),
    unlistedVia: via,
    cast,
  } satisfies SceneDetail)
})

// Unlist one video by hand: the "Unlisted" Stash tag (created on first use).
api.put('/scenes/:id/unlisted', async (c) => {
  await stash.setSceneUnlisted(sceneId(c.req.param('id')), true)
  dataCache.invalidate(HOME)
  return c.body(null, 204)
})
api.delete('/scenes/:id/unlisted', async (c) => {
  await stash.setSceneUnlisted(sceneId(c.req.param('id')), false)
  dataCache.invalidate(HOME)
  return c.body(null, 204)
})

api.put('/scenes/:id/hidden', async (c) => {
  await stash.setSceneHidden(sceneId(c.req.param('id')), true)
  return c.body(null, 204)
})
api.delete('/scenes/:id/hidden', async (c) => {
  await stash.setSceneHidden(sceneId(c.req.param('id')), false)
  return c.body(null, 204)
})

api.get('/scenes/:id/related', async (c) => {
  const id = c.req.param('id')
  const r = await stash.getScene(id)
  if (!r) return notFound()
  const ex = await exclusions()
  return c.json(await stash.relatedScenes(id, r.performerIds, r.studioId, r.tagIds, ex, r.group, relatedSide(r.marks, ex)))
})

const ratingBody = z.object({ rating: z.number().min(0).max(5).nullable() })

api.put('/scenes/:id/rating', async (c) => {
  const { rating } = parse(ratingBody, await c.req.json())
  await stash.updateSceneRating(c.req.param('id'), rating)
  return c.body(null, 204)
})

api.post('/scenes/:id/play', async (c) => {
  await stash.addScenePlay(c.req.param('id'))
  rebuildHomeSoon()
  return c.body(null, 204)
})

const activityBody = z.object({ resumeTime: z.number().min(0), playDuration: z.number().min(0) })

api.post('/scenes/:id/activity', async (c) => {
  const b = parse(activityBody, await c.req.json())
  await stash.saveSceneActivity(c.req.param('id'), b.resumeTime, b.playDuration)
  return c.body(null, 204)
})

api.post('/scenes/:id/o', async (c) => c.json({ oCount: await stash.addSceneO(c.req.param('id')) }))

api.patch('/scenes/:id', async (c) => {
  const b = parse(
    z.object({ title: z.string().trim().max(300).optional(), tagIds: z.array(z.string().regex(/^\d+$/)).max(500).optional() }),
    await c.req.json(),
  )
  await stash.updateScene(c.req.param('id'), b)
  return c.body(null, 204)
})

const markerBody = z.object({ seconds: z.number().min(0), title: z.string().trim().max(120).default(''), tagId: z.string().min(1).optional() })
api.post('/scenes/:id/markers', async (c) => {
  const b = parse(markerBody, await c.req.json())
  return c.json(await stash.createMarker(c.req.param('id'), b.seconds, b.title, b.tagId), 201)
})
// Title and/or primary tag; the Moments list edits both in place.
api.put('/scenes/:id/markers/:marker', async (c) => {
  const b = parse(z.object({ title: z.string().trim().max(120).optional(), tagId: z.string().min(1).optional() }), await c.req.json())
  return c.json(await stash.updateMarker(c.req.param('id'), c.req.param('marker'), b))
})
api.delete('/scenes/:id/markers/:marker', async (c) => {
  await stash.deleteMarker(c.req.param('id'), c.req.param('marker'))
  return c.body(null, 204)
})

// Deleting removes the file for good, through Whisparr; one scene at a time so a failure
// stops only that scene.
api.post('/scenes/delete', async (c) => {
  if (!config.whisparr) throw new HTTPException(501, { message: 'deleting needs WHISPARR_URL and WHISPARR_API_KEY' })
  const ids = parse(itemsBody, await c.req.json())
  const results: DeleteResult[] = []
  for (const id of ids) results.push(await deleteScene(id))
  return c.json(results)
})

api.get('/features', async (c) => {
  const sdb = !!config.whisparr && (await stashdb.available())
  return c.json({ deleteScenes: !!config.whisparr, whisparr: !!config.whisparr, stashdb: sdb, stashdbWeb: sdb ? await stashdb.webUrl() : null } satisfies Features)
})

// Answers with the finished job (200) in the usual case; 202 with the running job when it
// outlived the server's wait, which `GET /jobs/:id` then follows.
api.post('/scenes/:id/identify', async (c) => {
  const job = await stash.identifyScene(c.req.param('id'))
  return c.json(job, ['FINISHED', 'FAILED', 'CANCELLED'].includes(job.status) ? 200 : 202)
})
api.get('/jobs/:id', async (c) => c.json((await stash.jobStatus(c.req.param('id'))) ?? notFound()))

// --- performers / studios / tags --------------------------------------------------

api.get('/performers', async (c) => {
  const q = parse(listQuery, c.req.query())
  const page = q.page ?? 1
  const perPage = q.perPage ?? 60
  const r = await stash.findPerformers(
    stash.findFilter({ ...q, sort: q.sort ?? 'scenes_count', dir: q.dir ?? (q.sort === 'name' ? 'asc' : 'desc'), page, perPage }),
    await exclusions(),
    q.favorites ? { filter_favorites: true } : { scene_count: { value: 0, modifier: 'GREATER_THAN' } },
    genderCriterion(q.gender ?? 'all'), // the page's own switch, kept per browser (gender-switch-performers-page-only)
  )
  return c.json({ ...r, page, perPage })
})

api.get('/performers/:id', async (c) => c.json((await stash.getPerformer(c.req.param('id'))) ?? notFound()))

api.put('/performers/:id/favorite', async (c) => {
  const { favorite } = parse(z.object({ favorite: z.boolean() }), await c.req.json())
  await stash.setPerformerFavorite(c.req.param('id'), favorite)
  kickSync() // Whisparr follows the follow, a little later and never in this request
  return c.body(null, 204)
})

api.put('/performers/:id/rating', async (c) => {
  const { rating } = parse(ratingBody, await c.req.json())
  await stash.setPerformerRating(c.req.param('id'), rating)
  return c.body(null, 204)
})

api.get('/studios', async (c) => {
  const q = parse(listQuery, c.req.query())
  const page = q.page ?? 1
  const perPage = q.perPage ?? 60
  const r = await stash.findStudios(
    stash.findFilter({ ...q, sort: q.sort ?? 'scenes_count', dir: q.dir ?? (q.sort === 'name' ? 'asc' : 'desc'), page, perPage }),
    await exclusions(),
  )
  return c.json({ ...r, page, perPage })
})

api.get('/studios/:id', async (c) => c.json((await stash.getStudio(c.req.param('id'))) ?? notFound()))

api.put('/studios/:id/favorite', async (c) => {
  const { favorite } = parse(z.object({ favorite: z.boolean() }), await c.req.json())
  await stash.setStudioFavorite(c.req.param('id'), favorite)
  return c.body(null, 204)
})

api.get('/tags', async (c) => {
  const q = parse(listQuery, c.req.query())
  const page = q.page ?? 1
  const perPage = q.perPage ?? 200
  const r = await stash.findTags(
    stash.findFilter({ ...q, sort: q.sort ?? 'scenes_count', dir: q.dir ?? (q.sort === 'name' ? 'asc' : 'desc'), page, perPage }),
    q.unblocked ? { tags: [], performers: [], studios: [] } : await exclusions(),
  )
  return c.json({ ...r, page, perPage })
})

api.get('/tags/tiles', async (c) => c.json(await stash.tagTiles(await exclusions())))

api.get('/tags/:id', async (c) => c.json((await stash.getTag(c.req.param('id'))) ?? notFound()))

api.put('/tags/:id/favorite', async (c) => {
  const { favorite } = parse(z.object({ favorite: z.boolean() }), await c.req.json())
  await stash.setTagFavorite(c.req.param('id'), favorite)
  return c.body(null, 204)
})

// Typeahead: a few of each kind, blocklist applied.
api.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 200)
  if (!q) return c.json({ scenes: [], performers: [], studios: [], tags: [] } satisfies SearchResult)
  const blocked = await exclusions()
  const f = { q, perPage: 6 }
  const [scenes, performers, studios, tags] = await Promise.all([
    stash.findScenes(stash.findFilter(f), stash.sceneFilter({}, blocked)),
    stash.findPerformers(stash.findFilter({ ...f, sort: 'scenes_count' }), blocked),
    stash.findStudios(stash.findFilter({ ...f, sort: 'scenes_count' }), blocked),
    stash.findTags(stash.findFilter({ ...f, sort: 'scenes_count' }), blocked),
  ])
  return c.json({
    scenes: scenes.items,
    performers: performers.items,
    studios: studios.items,
    tags: tags.items,
  } satisfies SearchResult)
})

// --- settings -------------------------------------------------------------------

api.get('/settings', async (c) => c.json(await getSettings()))

api.put('/settings', async (c) => {
  const b = parse(
    z
      .object({ performerGender: z.enum(['women', 'men', 'all']), panicUrl: z.url({ protocol: /^https?$/ }), playOnOpen: z.boolean(), people, featured: weightsBody, whisparrSync: z.boolean(), hideVr: z.boolean() })
      .partial(),
    await c.req.json(),
  )
  // still accepted and stored, read by nothing since 2026-10-31 (gender-switch-performers-page-only)
  if (b.performerGender) await setSetting('performerGender', b.performerGender)
  if (b.panicUrl) await setSetting('panicUrl', b.panicUrl)
  if (b.playOnOpen !== undefined) await setSetting('playOnOpen', b.playOnOpen)
  if (b.whisparrSync !== undefined) {
    await setSetting('whisparrSync', b.whisparrSync)
    kickSync()
  }
  if (b.people) await setSetting('people', b.people)
  if (b.hideVr !== undefined) await setSetting('hideVr', b.hideVr)
  if (b.featured) await setSetting('featured', sanitizeWeights(b.featured, (await getSettings()).featured))
  if (b.people || b.featured) homeChanged() // the feed was built with the old defaults or dials
  return c.json(await getSettings())
})

// Seconds to skip at the start of this studio's videos; null clears it.
api.put('/studios/:id/intro', async (c) => {
  const { seconds } = parse(z.object({ seconds: z.number().min(0).max(600).nullable() }), await c.req.json())
  const id = parse(z.string().regex(/^\d+$/), c.req.param('id')) // a studio id, not any key
  const skip = { ...(await getSettings()).introSkip }
  if (seconds && Math.round(seconds) > 0) skip[id] = Math.round(seconds)
  else delete skip[id]
  await setSetting('introSkip', skip)
  return c.json(await getSettings())
})

// --- favorites (the built-in playlist behind the heart on videos) ------------------

const sceneId = (s: string) => parse(z.string().regex(/^\d+$/), s)

api.get('/favorites', async (c) => c.json(await pl.favoriteIds()))

api.post('/favorites', async (c) => {
  const ids = parse(itemsBody, await c.req.json())
  const fav = await pl.favoritesPlaylist()
  for (const s of ids) await pl.addToPlaylist(fav, s)
  return c.body(null, 204)
})

api.put('/favorites/:sceneId', async (c) => {
  await pl.addToPlaylist(await pl.favoritesPlaylist(), sceneId(c.req.param('sceneId')))
  return c.body(null, 204)
})

api.delete('/favorites/:sceneId', async (c) => {
  await pl.removeFromPlaylist(await pl.favoritesPlaylist(), sceneId(c.req.param('sceneId')))
  return c.body(null, 204)
})

api.get('/scenes/:id/playlists', async (c) =>
  c.json((await pl.playlistsContaining(sceneId(c.req.param('id')))).map((p) => p.id)),
)

// --- playlists ------------------------------------------------------------------

const playlistBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
})
const pid = (s: string) => parse(z.coerce.number().int().positive(), s)

api.get('/playlists', async (c) => c.json(await pl.listPlaylists()))

api.post('/playlists', async (c) => {
  const b = parse(playlistBody.extend({ sceneId: z.string().regex(/^\d+$/).optional() }), await c.req.json())
  const id = await pl.createPlaylist(b.name, b.description ?? null)
  if (b.sceneId) await pl.addToPlaylist(id, b.sceneId)
  return c.json({ id }, 201)
})

api.get('/playlists/:id', async (c) => c.json((await pl.getPlaylist(pid(c.req.param('id')))) ?? notFound()))

api.put('/playlists/:id', async (c) => {
  const b = parse(playlistBody, await c.req.json())
  await pl.updatePlaylist(pid(c.req.param('id')), b.name, b.description ?? null)
  return c.body(null, 204)
})

api.delete('/playlists/:id', async (c) => {
  await pl.deletePlaylist(pid(c.req.param('id')))
  return c.body(null, 204)
})

// One scene ({sceneId}) or many ({sceneIds}, multi-select), appended in the given order.
const itemsBody = z.union([
  z.object({ sceneId: z.string().regex(/^\d+$/) }).transform((b) => [b.sceneId]),
  z.object({ sceneIds: z.array(z.string().regex(/^\d+$/)).min(1).max(500) }).transform((b) => b.sceneIds),
])

api.post('/playlists/:id/items', async (c) => {
  const ids = parse(itemsBody, await c.req.json())
  const id = pid(c.req.param('id'))
  for (const s of ids) await pl.addToPlaylist(id, s)
  return c.body(null, 204)
})

api.delete('/playlists/:id/items/:sceneId', async (c) => {
  await pl.removeFromPlaylist(pid(c.req.param('id')), c.req.param('sceneId'))
  return c.body(null, 204)
})

api.put('/playlists/:id/order', async (c) => {
  const { sceneIds } = parse(z.object({ sceneIds: z.array(z.string().regex(/^\d+$/)).max(5000) }), await c.req.json())
  await pl.reorderPlaylist(pid(c.req.param('id')), sceneIds)
  return c.body(null, 204)
})

// --- blocklist ------------------------------------------------------------------

const kind = z.enum(['tag', 'performer', 'studio'])

api.get('/blocklist', async (c) => c.json(await blocklist()))

api.put('/blocklist/:kind/:id', async (c) => {
  const k = parse(kind, c.req.param('kind'))
  const id = c.req.param('id')
  const name = await stash.namesFor(k, id)
  if (!name) return notFound()
  await block(k, id, name)
  await relist(k, id) // blocked and Unlisted never at once: blocking wins
  kickSync() // a blocked performer or studio must not stay monitored in Whisparr
  return c.body(null, 204)
})

api.delete('/blocklist/:kind/:id', async (c) => {
  await unblock(parse(kind, c.req.param('kind')), c.req.param('id'))
  kickSync()
  return c.body(null, 204)
})

// --- Cast categories (cast.ts, wiki features/cast) ------------------------------------

api.get('/cast', async (c) => c.json(await castStatus()))
// writes Cast categories in Stash (the user asked for these to be kept in sync, 2026-11-09)
api.post('/cast/sync', async (c) => {
  await syncCast()
  return c.json(await castStatus())
})
// A video's cast by hand, when Stash's performers miss someone; DELETE goes back to the performers.
const castCount = z.object({ F: z.number().int().min(0).max(20), M: z.number().int().min(0).max(20), X: z.number().int().min(0).max(20) })
api.put('/scenes/:id/cast', async (c) => {
  const id = sceneId(c.req.param('id'))
  const n = parse(castCount, await c.req.json())
  const r = await stash.getScene(id)
  if (!r) return notFound()
  await setOverride(id, n, r.scene.title)
  return c.body(null, 204)
})
api.delete('/scenes/:id/cast', async (c) => {
  await setOverride(sceneId(c.req.param('id')), null)
  return c.body(null, 204)
})

// --- Unlisted (unlisted.ts, wiki features/vault) --------------------------------------

api.get('/unlisted', async (c) => c.json(await unlistedList()))

// Videos unlisted by hand, for Settings (registered here; /scenes/:id is matched by its id regex).
api.get('/unlisted/scenes', async (c) => c.json(await stash.unlistedScenes()))

api.put('/unlisted/:kind/:id', async (c) => {
  const k = parse(kind, c.req.param('kind'))
  const id = c.req.param('id')
  const name = await stash.namesFor(k, id)
  if (!name) return notFound()
  await unlist(k, id, name)
  await unblock(k, id) // unlisting something blocked brings it back as Unlisted
  return c.body(null, 204)
})

api.delete('/unlisted/:kind/:id', async (c) => {
  await relist(parse(kind, c.req.param('kind')), c.req.param('id'))
  return c.body(null, 204)
})

// --- Whisparr: scenes it knows but has not downloaded, and one explicit fetch at a time ----
// Nothing here searches a performer or a studio; monitoring follows follows only through the
// sync (sync.ts, decisions/whisparr-nothing-monitored).

const pageOf = (c: Context) => {
  const n = Number(c.req.query('page') ?? 1)
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : 1
}
api.get('/whisparr/performer/:id', async (c) => c.json(await whisparr.wanted({ performers: await stash.stashIdsOf('performer', c.req.param('id')) }, pageOf(c))))
api.get('/whisparr/studio/:id', async (c) => c.json(await whisparr.wanted({ studios: await stash.stashIdsOf('studio', c.req.param('id')) }, pageOf(c))))
// Home's shelf: Unlisted performers, studios and categories never featured (wiki features/vault)
api.get('/whisparr/new', async (c) => c.json(config.whisparr ? await dropUnlistedWanted(await whisparr.recentWanted(await stash.favoritePerformerStashIds())) : []))
api.get('/whisparr/activity', async (c) => c.json(await whisparr.currentActivity()))

// StashDB maintenance: the rate limiter's counters, and what a schema type looks like
// (read-only introspection through the same rate-limited client).
api.get('/admin/stashdb', (c) => c.json(stashdb.limiter))
api.get('/admin/stashdb/type/:name', async (c) => {
  try {
    return c.json(await stashdb.describeType(c.req.param('name')))
  } catch (e) {
    if (e instanceof RangeError) throw new HTTPException(400, { message: e.message })
    throw e
  }
})

// The follow sync (sync.ts): its last run, and a run now (applies only when Settings allows).
api.get('/sync', async (c) => c.json(await syncStatus()))
// From Settings (no body): follows the switch. From scripts/whisparr-sync.mjs: {apply, force};
// a person asked, so the timer's size limit is off.
api.post('/sync/run', async (c) => {
  const b = parse(z.object({ apply: z.boolean().optional(), force: z.boolean().optional() }), await c.req.json().catch(() => ({})))
  return c.json(await runSync(b.apply === undefined ? {} : { apply: b.apply, force: b.force }))
})
// "Watching for new scenes" on a performer page: followed (flix's discovery looks for their new
// releases) and what of theirs is downloading. Whisparr down reads as nothing downloading.
api.get('/whisparr/watch/performer/:id', async (c) => {
  const id = c.req.param('id')
  const [p, ids, settings] = await Promise.all([stash.getPerformer(id), stash.stashIdsOf('performer', id).catch(() => [] as string[]), getSettings()])
  const watching = !!config.whisparr && settings.whisparrSync && !!p?.favorite
  const downloading = config.whisparr ? (await whisparr.performerWatch(ids, null).catch(() => ({ downloading: 0 }))).downloading : 0
  return c.json({ watching, managed: watching, downloading })
})

// --- Discover: StashDB through flix's mirror (catalog.ts) ------------------------------------

const idList = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').filter(Boolean).slice(0, 10) : []))
const discoverQuery = z.object({
  q: z.string().max(100).optional(),
  performers: idList,
  studios: idList,
  tags: idList,
  sort: z.enum(['date', 'added', 'trending']).optional(),
  page: z.coerce.number().int().min(1).max(200).optional(),
  unblocked: z.enum(['1']).optional(),
  fresh: z.enum(['1']).optional(),
})
// A StashDB scene's description, for the About on a Discover card ('' when it has none).
api.get('/discover/scenes/:id/details', async (c) => {
  if (!(await stashdb.available())) throw new HTTPException(404, { message: 'StashDB is not configured' })
  const id = parse(z.string().uuid(), c.req.param('id'))
  const details = await catalog.sceneDetails(id)
  if (details == null) return notFound()
  return c.json({ details } satisfies SdbSceneDetails)
})

api.get('/discover', async (c) => {
  if (!(await stashdb.available())) throw new HTTPException(404, { message: 'StashDB is not configured' })
  const q = parse(discoverQuery, c.req.query())
  return c.json(await catalog.discover({ ...q, unblocked: q.unblocked === '1', fresh: q.fresh === '1' }))
})
api.get('/discover/names', async (c) => {
  const q = parse(z.object({ kind: z.enum(['performer', 'studio', 'tag']), q: z.string().max(100) }), c.req.query())
  return c.json(await catalog.searchNames(q.kind, q.q))
})
api.get('/discover/entity/:kind/:id', async (c) => {
  const kind = parse(z.enum(['performer', 'studio', 'tag']), c.req.param('kind'))
  return c.json((await catalog.entity(kind, c.req.param('id'))) ?? notFound())
})
// The StashDB ids of a library performer or studio, for "Browse on StashDB" links.
api.get('/discover/from/:kind/:id', async (c) => {
  const kind = parse(z.enum(['performer', 'studio']), c.req.param('kind'))
  return c.json({ ids: await stash.stashIdsOf(kind, c.req.param('id')).catch(() => [] as string[]) })
})
// Find followed ones' new releases now (also daily when the Settings switch is on).
api.post('/discover/run', async (c) => c.json({ queued: await getq.discoverNew() }))

// --- the Whisparr cleanup (cleanup.ts): records without files that nothing is fetching ---------

api.get('/whisparr/cleanup', (c) => c.json(cleanup.cleanupStatus))
api.post('/whisparr/cleanup', async (c) => {
  const uuid = z.string().regex(/^[0-9a-f-]{36}$/i).optional()
  const body = parse(z.object({ apply: z.boolean().optional(), studio: uuid, performer: uuid }), await c.req.json().catch(() => ({})))
  if (body.studio && body.performer) throw new HTTPException(400, { message: 'one of studio or performer' })
  try {
    if (!body.apply) return c.json(await cleanup.previewCleanup(body.studio, body.performer))
    return c.json(await cleanup.startCleanup(body.studio, body.performer), 202)
  } catch (e) {
    if (e instanceof RangeError) throw new HTTPException(409, { message: e.message })
    throw e
  }
})

// Put back a feature film's record at its folder on disk (unmonitored, no search, rescanned).
api.post('/whisparr/restore-film', async (c) => {
  if (!config.whisparr) throw new HTTPException(404, { message: 'Whisparr is not configured' })
  const body = parse(z.object({ tmdbId: z.number().int().positive(), path: z.string().startsWith('/volume1/Media/adult/movies/').max(400) }), await c.req.json())
  try {
    return c.json(await whisparr.restoreFilm(body.tmdbId, body.path))
  } catch (e) {
    if (e instanceof RangeError) throw new HTTPException(400, { message: e.message })
    throw e
  }
})

// --- the paced Get queue and the scenes still waiting for a release (getqueue.ts) ------------

api.post('/whisparr/get-many', async (c) => {
  if (!config.whisparr) throw new HTTPException(404, { message: 'Whisparr is not configured' })
  const { stashdbIds } = parse(z.object({ stashdbIds: z.array(z.string().regex(/^[0-9a-f-]{36}$/i)).min(1).max(getq.MAX_SELECTION) }), await c.req.json())
  return c.json({ queued: await getq.enqueue(stashdbIds) }, 202)
})
api.get('/whisparr/waiting', async (c) => c.json(config.whisparr ? await getq.waiting() : []))
api.get('/whisparr/queue-status', (c) => c.json(getq.queueStatus))
api.post('/whisparr/waiting/:movieId/search', async (c) => {
  try {
    await getq.searchNow(Number(parse(z.string().regex(/^\d{1,9}$/), c.req.param('movieId'))))
    return c.body(null, 204)
  } catch (e) {
    if (e instanceof RangeError) throw new HTTPException(400, { message: e.message })
    throw e
  }
})
api.delete('/whisparr/waiting/:movieId', async (c) => {
  await getq.giveUp(Number(parse(z.string().regex(/^\d{1,9}$/), c.req.param('movieId'))))
  return c.body(null, 204)
})
api.delete('/whisparr/queue/:stashdbId', async (c) => {
  await getq.cancel(c.req.param('stashdbId'))
  return c.body(null, 204)
})

api.post('/whisparr/get/:id', async (c) => {
  if (!config.whisparr) throw new HTTPException(404, { message: 'Whisparr is not configured' })
  const raw = c.req.param('id')
  if (!/^\d{1,9}$/.test(raw)) throw new HTTPException(400, { message: 'one Whisparr scene id is required' })
  try {
    const w = await whisparr.getScene(Number(raw))
    await rememberGet(w.whisparrId)
    return c.json(w)
  } catch (e) {
    if (e instanceof RangeError) throw new HTTPException(400, { message: e.message })
    throw e
  }
})

// A scene only StashDB lists: add that one scene to Whisparr and search for it.
api.post('/whisparr/get-remote/:stashdbId', async (c) => {
  if (!config.whisparr) throw new HTTPException(404, { message: 'Whisparr is not configured' })
  const raw = c.req.param('stashdbId')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) throw new HTTPException(400, { message: 'one StashDB scene id is required' })
  try {
    const w = await whisparr.getRemote(raw)
    await rememberGet(w.whisparrId)
    return c.json(w)
  } catch (e) {
    if (e instanceof RangeError) throw new HTTPException(400, { message: e.message })
    throw e
  }
})
