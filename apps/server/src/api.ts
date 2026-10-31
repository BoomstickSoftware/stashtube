import type { DeleteResult, Duplicates, Features, FeaturedWeights, HomeRow, Page, SceneCard, SceneDetail, SceneQuery, SearchResult } from '@flix/shared'
import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { block, blocklist, exclusions, unblock } from './blocklist.ts'
import { config } from './config.ts'
import { deleteScene } from './delete.ts'
import { toGroup } from './duplicates.ts'
import { NO_AFFINITY, rankFeatured, sanitizeWeights, type Affinity, type Candidate } from './featured.ts'
import * as pl from './playlists.ts'
import * as savedRows from './rows.ts'
import * as stations from './stations.ts'
import * as stashdb from './stashdb.ts'
import * as whisparr from './whisparr.ts'
import { genderCriterion, genderAllows, getSettings, setSetting } from './settings.ts'
import * as stash from './stash.ts'
import { daySeed } from './stash.ts'
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
  gender: z.enum(['women', 'men', 'all']).optional(), // performers only; default from settings
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

api.get('/home', async (c) => c.json(await homeRows(seedParam(c.req.query('seed')))))

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
async function featured(weights: FeaturedWeights, seed: string, limit: number): Promise<SceneCard[]> {
  const blocked = await exclusions()
  const [pool, aff] = await Promise.all([stash.featuredPool(blocked), stash.affinities()])
  const affinity: Affinity = aff
    ? { performers: new Map([...aff.performers].map(([id, p]) => [id, p.w])), studios: aff.studios, tags: aff.tags }
    : NO_AFFINITY
  return rankFeatured(pool.map(toCandidate), affinity, weights, seed, limit).map((r) => ({ ...r.card, why: r.why }))
}

api.get('/featured', async (c) =>
  c.json(await featured((await getSettings()).featured, seedParam(c.req.query('seed')), limitParam(c.req.query('limit')))),
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
  const related = await stash.relatedScenes(last.id, r.performerIds, r.studioId, r.tagIds, blocked)
  const items = [...related.filter((s) => !s.playCount), ...related.filter((s) => s.playCount)].slice(0, 24)
  if (items.length < 3) return null
  const title = last.title.length > 48 ? `${last.title.slice(0, 46).trimEnd()}…` : last.title
  return { key: 'because', title: `Because you watched ${title}`, from: last.id, items }
}

// The home feed. Also run at startup and after Stash changes, so the first visit is warm.
export async function homeRows(visitSeed = String(daySeed())): Promise<HomeRow[]> {
  const blocked = await exclusions()
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
  const recsP = stash.recommendations(blocked, (g) => genderAllows(settings.performerGender, g)).catch(failed('recommendations'))
  const [recs, picks, because, pinnedRows, moreWith, rows] = await Promise.all([
    recsP,
    featured(settings.featured, visitSeed, 24).catch(failed('featured')),
    becauseYouWatched(blocked).catch(failed('because you watched')),
    savedRows.listRows().then((pinned) => Promise.all(pinned.map(async (r) => ({ ...(await row(`saved-${r.id}`, r.title, r.query)), savedId: r.id })))),
    recsP.then((r) =>
      Promise.all((r?.favPerformers ?? []).map((p) => row(`more-${p.id}`, `More with ${p.name}`, { performers: p.id, sort: 'random', seed }))),
    ),
    Promise.all([
      row('favorites', 'New from your favourites', { favorites: true, sort: 'date' }),
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

api.get('/rows', async (c) => c.json(await savedRows.listRows()))
api.post('/rows', async (c) => {
  const b = parse(rowBody, await c.req.json())
  return c.json({ id: await savedRows.addRow(b.title, b.query) }, 201)
})
api.put('/rows/order', async (c) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int()).max(100) }), await c.req.json())
  await savedRows.reorderRows(ids)
  return c.body(null, 204)
})
api.put('/rows/:id', async (c) => {
  const { title } = parse(rowBody.pick({ title: true }), await c.req.json())
  await savedRows.renameRow(rid(c.req.param('id')), title)
  return c.body(null, 204)
})
api.delete('/rows/:id', async (c) => {
  await savedRows.deleteRow(rid(c.req.param('id')))
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
api.get('/stats', async (c) => {
  const g = (await getSettings()).performerGender
  return c.json(await stash.stats((x) => genderAllows(g, x), await exclusions()))
})

api.get('/scenes/:id', async (c) => {
  const id = c.req.param('id')
  const r = await stash.getScene(id)
  if (!r) return notFound()
  const hidden = await stash.hiddenTag()
  return c.json({ ...r.scene, hidden: !!hidden && r.tagIds.includes(hidden) } satisfies SceneDetail)
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
  return c.json(await stash.relatedScenes(id, r.performerIds, r.studioId, r.tagIds, await exclusions(), r.group))
})

const ratingBody = z.object({ rating: z.number().min(0).max(5).nullable() })

api.put('/scenes/:id/rating', async (c) => {
  const { rating } = parse(ratingBody, await c.req.json())
  await stash.updateSceneRating(c.req.param('id'), rating)
  return c.body(null, 204)
})

api.post('/scenes/:id/play', async (c) => {
  await stash.addScenePlay(c.req.param('id'))
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

api.get('/features', async (c) => c.json({ deleteScenes: !!config.whisparr, whisparr: !!config.whisparr, stashdb: !!config.whisparr && (await stashdb.available()) } satisfies Features))

api.post('/scenes/:id/identify', async (c) => c.json({ jobId: await stash.identifyScene(c.req.param('id')) }, 202))
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
    genderCriterion(q.gender ?? (await getSettings()).performerGender),
  )
  return c.json({ ...r, page, perPage })
})

api.get('/performers/:id', async (c) => c.json((await stash.getPerformer(c.req.param('id'))) ?? notFound()))

api.put('/performers/:id/favorite', async (c) => {
  const { favorite } = parse(z.object({ favorite: z.boolean() }), await c.req.json())
  await stash.setPerformerFavorite(c.req.param('id'), favorite)
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
    stash.findPerformers(stash.findFilter({ ...f, sort: 'scenes_count' }), blocked, {}, genderCriterion((await getSettings()).performerGender)),
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
      .object({ performerGender: z.enum(['women', 'men', 'all']), panicUrl: z.url({ protocol: /^https?$/ }), playOnOpen: z.boolean(), people, featured: weightsBody })
      .partial(),
    await c.req.json(),
  )
  if (b.performerGender) await setSetting('performerGender', b.performerGender)
  if (b.panicUrl) await setSetting('panicUrl', b.panicUrl)
  if (b.playOnOpen !== undefined) await setSetting('playOnOpen', b.playOnOpen)
  if (b.people) await setSetting('people', b.people)
  if (b.featured) await setSetting('featured', sanitizeWeights(b.featured, (await getSettings()).featured))
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
  return c.body(null, 204)
})

api.delete('/blocklist/:kind/:id', async (c) => {
  await unblock(parse(kind, c.req.param('kind')), c.req.param('id'))
  return c.body(null, 204)
})

// --- Whisparr: scenes it knows but has not downloaded, and one explicit fetch at a time ----
// Nothing here monitors or searches a performer or a studio (library policy; see whisparr.ts).

const pageOf = (c: Context) => {
  const n = Number(c.req.query('page') ?? 1)
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : 1
}
api.get('/whisparr/performer/:id', async (c) => c.json(await whisparr.wanted({ performers: await stash.stashIdsOf('performer', c.req.param('id')) }, pageOf(c))))
api.get('/whisparr/studio/:id', async (c) => c.json(await whisparr.wanted({ studios: await stash.stashIdsOf('studio', c.req.param('id')) }, pageOf(c))))
api.get('/whisparr/new', async (c) => c.json(config.whisparr ? await whisparr.recentWanted(await stash.favoritePerformerStashIds()) : []))
api.get('/whisparr/activity', async (c) => c.json(await whisparr.currentActivity()))

api.post('/whisparr/get/:id', async (c) => {
  if (!config.whisparr) throw new HTTPException(404, { message: 'Whisparr is not configured' })
  const raw = c.req.param('id')
  if (!/^\d{1,9}$/.test(raw)) throw new HTTPException(400, { message: 'one Whisparr scene id is required' })
  try {
    return c.json(await whisparr.getScene(Number(raw)))
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
    return c.json(await whisparr.getRemote(raw))
  } catch (e) {
    if (e instanceof RangeError) throw new HTTPException(400, { message: e.message })
    throw e
  }
})
