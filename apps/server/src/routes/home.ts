import { Hono } from 'hono'
import { z } from 'zod'
import { sanitizeWeights } from '../featured.ts'
import { featured, homeChanged, homeRows, noteHomeSeed } from '../home.ts'
import * as savedRows from '../rows.ts'
import { getSettings } from '../settings.ts'
import { body, limitParam, offsetParam, parse, rowId, sceneQuery, seedParam, weightsBody } from './shared.ts'

export const home = new Hono()

home.get('/home', async (c) => {
  return c.json(await homeRows(noteHomeSeed(seedParam(c.req.query('seed')))))
})

home.get('/featured', async (c) =>
  c.json(await featured((await getSettings()).featured, seedParam(c.req.query('seed')), limitParam(c.req.query('limit')), offsetParam(c.req.query('offset')))),
)

// Settings' live preview: score with dials that are not saved (yet).
home.post('/featured/preview', async (c) => {
  const b = parse(z.object({ weights: weightsBody, seed: z.string().optional(), limit: z.number().optional() }), await body(c))
  const weights = sanitizeWeights(b.weights, (await getSettings()).featured)
  return c.json(await featured(weights, seedParam(b.seed), limitParam(b.limit == null ? undefined : String(b.limit))))
})

// --- pinned rows ---------------------------------------------------------------

const rowBody = z.object({ title: z.string().trim().min(1).max(80), query: sceneQuery })

home.get('/rows', async (c) => c.json(await savedRows.listRows()))
home.post('/rows', async (c) => {
  const b = parse(rowBody, await body(c))
  const id = await savedRows.addRow(b.title, b.query)
  homeChanged()
  return c.json({ id }, 201)
})
home.put('/rows/order', async (c) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int()).max(100) }), await body(c))
  await savedRows.reorderRows(ids)
  homeChanged()
  return c.body(null, 204)
})
home.put('/rows/:id', async (c) => {
  const { title } = parse(rowBody.pick({ title: true }), await body(c))
  await savedRows.renameRow(rowId(c.req.param('id')), title)
  homeChanged()
  return c.body(null, 204)
})
home.delete('/rows/:id', async (c) => {
  await savedRows.deleteRow(rowId(c.req.param('id')))
  homeChanged()
  return c.body(null, 204)
})
