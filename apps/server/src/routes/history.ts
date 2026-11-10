import { Hono } from 'hono'
import { z } from 'zod'
import { exclusions } from '../blocklist.ts'
import * as stash from '../stash.ts'
import { body, parse } from './shared.ts'

export const history = new Hono()

const historyQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(40),
  tz: z.coerce.number().int().min(-840).max(840).default(0),
})
history.get('/history', async (c) => {
  const q = parse(historyQuery, c.req.query())
  const r = await stash.history(q.page, q.perPage, q.tz, await exclusions())
  return c.json({ ...r, page: q.page, perPage: q.perPage })
})
const historyPlays = z.object({ plays: z.array(z.object({ id: z.string().regex(/^\d+$/), times: z.array(z.string().min(1).max(40)).min(1).max(500) })).min(1).max(500) })
// Removing deletes exactly those plays; restoring (Undo) puts the same times back.
history.post('/history/remove', async (c) => {
  for (const p of parse(historyPlays, await body(c)).plays) await stash.deletePlays(p.id, p.times)
  return c.body(null, 204)
})
history.post('/history/restore', async (c) => {
  for (const p of parse(historyPlays, await body(c)).plays) await stash.addPlays(p.id, p.times)
  return c.body(null, 204)
})
history.get('/stats', async (c) => c.json(await stash.stats(await exclusions())))
