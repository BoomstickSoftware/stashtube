import type { HomeRow, Page, SceneDetail, SceneQuery, SearchResult } from '@flix/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { block, blocklist, exclusions, unblock } from './blocklist.ts'
import * as pl from './playlists.ts'
import * as savedRows from './rows.ts'
import { genderCriterion, genderAllows, getSettings, setSetting } from './settings.ts'
import * as stash from './stash.ts'

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
}) satisfies z.ZodType<SceneQuery>

const listQuery = z.object({
  q: z.string().max(200).optional(),
  sort: z.enum(['name', 'scenes_count', 'rating', 'created_at', 'random']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  page: num,
  perPage: z.coerce.number().int().min(1).max(1000).optional(),
  seed: num,
  favorites: flag,
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

const daySeed = () => Math.floor(Date.now() / 86_400_000)

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

api.get('/home', async (c) => c.json(await homeRows()))

// The home feed. Also run at startup and after Stash changes, so the first visit is warm.
export async function homeRows(): Promise<HomeRow[]> {
  const blocked = await exclusions()
  const row = async (key: string, title: string, query: SceneQuery): Promise<HomeRow> => {
    const f = query.sort === 'random' && !query.seed ? { ...query, seed: daySeed() } : query
    const r = await stash.findScenes(stash.findFilter({ ...f, perPage: 24 }), stash.sceneFilter(f, blocked))
    return { key, title, browse: f, items: r.items }
  }
  const seed = daySeed()
  const settings = await getSettings()
  const [recs, pinned] = await Promise.all([
    stash.recommendations(blocked, (g) => genderAllows(settings.performerGender, g)).catch((e) => {
      console.error('recommendations:', e.message)
      return null
    }),
    savedRows.listRows(),
  ])
  const personal: HomeRow[] = []
  if (recs?.forYou.length) personal.push({ key: 'for-you', title: 'For you', browse: { unwatched: true }, items: recs.forYou })
  const pinnedRows = await Promise.all(
    pinned.map(async (r) => ({ ...(await row(`saved-${r.id}`, r.title, r.query)), savedId: r.id })),
  )
  const moreWith = await Promise.all(
    (recs?.favPerformers ?? []).map((p) => row(`more-${p.id}`, `More with ${p.name}`, { performers: p.id, sort: 'random', seed })),
  )
  const rows = await Promise.all([
    row('favorites', 'New from your favourites', { favorites: true, sort: 'date' }),
    row('recent', 'Recently added', { sort: 'created_at' }),
    row('discover', 'Discover', { sort: 'random', seed, unwatched: true }),
    row('top', 'Top rated', { sort: 'rating', minRating: 4 }),
    row('releases', 'Latest releases', { sort: 'date' }),
    row('most', 'Most watched', { sort: 'play_count' }),
  ])
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

// --- history and stats -------------------------------------------------------------

api.get('/history', async (c) => c.json(await stash.history()))
api.delete('/history/:id', async (c) => {
  await stash.removeFromHistory(sceneId(c.req.param('id')))
  return c.body(null, 204)
})
api.get('/stats', async (c) => {
  const g = (await getSettings()).performerGender
  return c.json(await stash.stats((x) => genderAllows(g, x)))
})

api.get('/scenes/:id', async (c) => {
  const id = c.req.param('id')
  const r = await stash.getScene(id)
  if (!r) return notFound()
  const playlists = await pl.playlistsContaining(id)
  return c.json({ ...r.scene, playlists } satisfies SceneDetail)
})

api.get('/scenes/:id/related', async (c) => {
  const id = c.req.param('id')
  const r = await stash.getScene(id)
  if (!r) return notFound()
  return c.json(await stash.relatedScenes(id, r.performerIds, r.studioId, r.tagIds, await exclusions()))
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

const markerBody = z.object({ seconds: z.number().min(0), title: z.string().trim().max(120).default('') })
api.post('/scenes/:id/markers', async (c) => {
  const b = parse(markerBody, await c.req.json())
  await stash.createMarker(c.req.param('id'), b.seconds, b.title)
  return c.body(null, 204)
})
api.put('/scenes/:id/markers/:marker', async (c) => {
  const b = parse(z.object({ title: z.string().trim().max(120) }), await c.req.json())
  await stash.updateMarker(c.req.param('id'), c.req.param('marker'), b.title)
  return c.body(null, 204)
})
api.delete('/scenes/:id/markers/:marker', async (c) => {
  await stash.deleteMarker(c.req.param('id'), c.req.param('marker'))
  return c.body(null, 204)
})

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
    c.req.query('unblocked') ? { tags: [], performers: [], studios: [] } : await exclusions(),
  )
  return c.json({ ...r, page, perPage })
})

api.get('/tags/tiles', async (c) => c.json(await stash.tagTiles(await exclusions())))

api.get('/tags/:id', async (c) => c.json((await stash.getTag(c.req.param('id'))) ?? notFound()))

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
      .object({ performerGender: z.enum(['women', 'men', 'all']), panicUrl: z.url({ protocol: /^https?$/ }), playOnOpen: z.boolean() })
      .partial(),
    await c.req.json(),
  )
  if (b.performerGender) await setSetting('performerGender', b.performerGender)
  if (b.panicUrl) await setSetting('panicUrl', b.panicUrl)
  if (b.playOnOpen !== undefined) await setSetting('playOnOpen', b.playOnOpen)
  return c.json(await getSettings())
})

// Seconds to skip at the start of this studio's videos; null clears it.
api.put('/studios/:id/intro', async (c) => {
  const { seconds } = parse(z.object({ seconds: z.number().min(0).max(600).nullable() }), await c.req.json())
  const id = c.req.param('id')
  const skip = { ...(await getSettings()).introSkip }
  if (seconds) skip[id] = Math.round(seconds)
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
