import { type Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import * as cleanup from '../cleanup.ts'
import { config } from '../config.ts'
import * as getq from '../getqueue.ts'
import { getSettings } from '../settings.ts'
import * as stash from '../stash.ts'
import * as stashdb from '../stashdb.ts'
import { rememberGet, runSync, syncStatus } from '../sync.ts'
import { dropHiddenWanted } from '../unlisted.ts'
import * as whisparr from '../whisparr.ts'
import { body, idParam, parse, refused } from './shared.ts'

export const whisparrRoutes = new Hono()

// --- Whisparr: scenes it knows but has not downloaded, and one explicit fetch at a time ----
// Nothing here searches a performer or a studio; monitoring follows follows only through the
// sync (sync.ts, decisions/whisparr-nothing-monitored).

const pageOf = (c: Context) => {
  const n = Number(c.req.query('page') ?? 1)
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : 1
}
whisparrRoutes.get('/whisparr/performer/:id', async (c) => c.json(await whisparr.wanted({ performers: await stash.stashIdsOf('performer', idParam(c)) }, pageOf(c))))
whisparrRoutes.get('/whisparr/studio/:id', async (c) => c.json(await whisparr.wanted({ studios: await stash.stashIdsOf('studio', idParam(c)) }, pageOf(c))))
// Home's shelf: Unlisted and blocked performers, studios and categories left out (wiki features/vault)
whisparrRoutes.get('/whisparr/new', async (c) => c.json(config.whisparr ? await dropHiddenWanted(await whisparr.recentWanted(await stash.favoritePerformerStashIds())) : []))
whisparrRoutes.get('/whisparr/activity', async (c) => c.json(await whisparr.currentActivity()))

// StashDB maintenance: the rate limiter's counters, and what a schema type looks like
// (read-only introspection through the same rate-limited client).
whisparrRoutes.get('/admin/stashdb', (c) => c.json(stashdb.limiter))
whisparrRoutes.get('/admin/stashdb/type/:name', async (c) => c.json(await refused(400, () => stashdb.describeType(c.req.param('name')))))

// The follow sync (sync.ts): its last run, and a run now (applies only when Settings allows).
whisparrRoutes.get('/sync', async (c) => c.json(await syncStatus()))
// From Settings (no body): follows the switch. From scripts/whisparr-sync.mjs: {apply, force};
// a person asked, so the timer's size limit is off.
whisparrRoutes.post('/sync/run', async (c) => {
  const b = parse(z.object({ apply: z.boolean().optional(), force: z.boolean().optional() }), await c.req.json().catch(() => ({})))
  return c.json(await runSync(b.apply === undefined ? {} : { apply: b.apply, force: b.force }))
})
// "Watching for new scenes" on a performer page: followed (flix's discovery looks for their new
// releases) and what of theirs is downloading. Whisparr down reads as nothing downloading.
whisparrRoutes.get('/whisparr/watch/performer/:id', async (c) => {
  const id = idParam(c)
  const [p, ids, settings] = await Promise.all([stash.getPerformer(id), stash.stashIdsOf('performer', id).catch(() => [] as string[]), getSettings()])
  const watching = !!config.whisparr && settings.whisparrSync && !!p?.favorite
  const downloading = config.whisparr ? (await whisparr.performerWatch(ids, null).catch(() => ({ downloading: 0 }))).downloading : 0
  return c.json({ watching, managed: watching, downloading })
})

// --- the Whisparr cleanup (cleanup.ts): records without files that nothing is fetching ---------

whisparrRoutes.get('/whisparr/cleanup', (c) => c.json(cleanup.cleanupStatus))
whisparrRoutes.post('/whisparr/cleanup', async (c) => {
  const uuid = z.string().regex(/^[0-9a-f-]{36}$/i).optional()
  const b = parse(z.object({ apply: z.boolean().optional(), studio: uuid, performer: uuid }), await c.req.json().catch(() => ({})))
  if (b.studio && b.performer) throw new HTTPException(400, { message: 'one of studio or performer' })
  if (!b.apply) return c.json(await refused(409, () => cleanup.previewCleanup(b.studio, b.performer)))
  return c.json(await refused(409, () => cleanup.startCleanup(b.studio, b.performer)), 202)
})

// Put back a feature film's record at its folder on disk (unmonitored, no search, rescanned).
whisparrRoutes.post('/whisparr/restore-film', async (c) => {
  if (!config.whisparr) throw new HTTPException(404, { message: 'Whisparr is not configured' })
  // only a folder under the film library (WHISPARR_FILM_ROOT), named without stepping out of it
  const path = z.string().startsWith(config.filmRoot).max(400).refine((p) => !p.split('/').includes('..'), { message: 'the path may not contain ..' })
  const b = parse(z.object({ tmdbId: z.number().int().positive(), path }), await body(c))
  return c.json(await refused(400, () => whisparr.restoreFilm(b.tmdbId, b.path)))
})

// --- the paced Get queue and the scenes still waiting for a release (getqueue.ts) ------------

whisparrRoutes.post('/whisparr/get-many', async (c) => {
  if (!config.whisparr) throw new HTTPException(404, { message: 'Whisparr is not configured' })
  const { stashdbIds } = parse(z.object({ stashdbIds: z.array(z.string().regex(/^[0-9a-f-]{36}$/i)).min(1).max(getq.MAX_SELECTION) }), await body(c))
  return c.json({ queued: await getq.enqueue(stashdbIds) }, 202)
})
whisparrRoutes.get('/whisparr/waiting', async (c) => c.json(config.whisparr ? await getq.waiting() : []))
whisparrRoutes.get('/whisparr/queue-status', (c) => c.json(getq.queueStatus))
whisparrRoutes.post('/whisparr/waiting/:movieId/search', async (c) => {
  const movieId = Number(parse(z.string().regex(/^\d{1,9}$/), c.req.param('movieId')))
  await refused(400, () => getq.searchNow(movieId))
  return c.body(null, 204)
})
whisparrRoutes.delete('/whisparr/waiting/:movieId', async (c) => {
  await getq.giveUp(Number(parse(z.string().regex(/^\d{1,9}$/), c.req.param('movieId'))))
  return c.body(null, 204)
})
whisparrRoutes.delete('/whisparr/queue/:stashdbId', async (c) => {
  await getq.cancel(c.req.param('stashdbId'))
  return c.body(null, 204)
})

whisparrRoutes.post('/whisparr/get/:id', async (c) => {
  if (!config.whisparr) throw new HTTPException(404, { message: 'Whisparr is not configured' })
  const raw = c.req.param('id')
  if (!/^\d{1,9}$/.test(raw)) throw new HTTPException(400, { message: 'one Whisparr scene id is required' })
  const w = await refused(400, () => whisparr.getScene(Number(raw)))
  await rememberGet(w.whisparrId)
  return c.json(w)
})

// A scene only StashDB lists: add that one scene to Whisparr and search for it.
whisparrRoutes.post('/whisparr/get-remote/:stashdbId', async (c) => {
  if (!config.whisparr) throw new HTTPException(404, { message: 'Whisparr is not configured' })
  const raw = c.req.param('stashdbId')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) throw new HTTPException(400, { message: 'one StashDB scene id is required' })
  const w = await refused(400, () => whisparr.getRemote(raw))
  await rememberGet(w.whisparrId)
  return c.json(w)
})
