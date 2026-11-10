import type { SdbSceneDetails } from '@flix/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import * as catalog from '../catalog.ts'
import * as getq from '../getqueue.ts'
import * as stash from '../stash.ts'
import * as stashdb from '../stashdb.ts'
import { idParam, notFound, parse } from './shared.ts'

export const discover = new Hono()

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
discover.get('/discover/scenes/:id/details', async (c) => {
  if (!(await stashdb.available())) throw new HTTPException(404, { message: 'StashDB is not configured' })
  const id = parse(z.string().uuid(), c.req.param('id'))
  const details = await catalog.sceneDetails(id)
  if (details == null) return notFound()
  return c.json({ details } satisfies SdbSceneDetails)
})

discover.get('/discover', async (c) => {
  if (!(await stashdb.available())) throw new HTTPException(404, { message: 'StashDB is not configured' })
  const q = parse(discoverQuery, c.req.query())
  return c.json(await catalog.discover({ ...q, unblocked: q.unblocked === '1', fresh: q.fresh === '1' }))
})
discover.get('/discover/names', async (c) => {
  const q = parse(z.object({ kind: z.enum(['performer', 'studio', 'tag']), q: z.string().max(100) }), c.req.query())
  return c.json(await catalog.searchNames(q.kind, q.q))
})
discover.get('/discover/entity/:kind/:id', async (c) => {
  const kind = parse(z.enum(['performer', 'studio', 'tag']), c.req.param('kind'))
  return c.json((await catalog.entity(kind, c.req.param('id'))) ?? notFound())
})
// The StashDB ids of a library performer or studio, for "Browse on StashDB" links.
discover.get('/discover/from/:kind/:id', async (c) => {
  const kind = parse(z.enum(['performer', 'studio']), c.req.param('kind'))
  return c.json({ ids: await stash.stashIdsOf(kind, idParam(c)).catch(() => [] as string[]) })
})
// Find followed ones' new releases now (also daily when the Settings switch is on).
discover.post('/discover/run', async (c) => c.json({ queued: await getq.discoverNew() }))
