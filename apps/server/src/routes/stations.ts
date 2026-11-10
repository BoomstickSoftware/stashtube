import { Hono } from 'hono'
import { z } from 'zod'
import * as stationStore from '../stations.ts'
import { body, parse, rowId, sceneQuery } from './shared.ts'

export const stations = new Hono()

const stationBody = z.object({
  name: z.string().trim().min(1).max(80),
  query: sceneQuery,
  from: z.string().regex(/^\d+$/).optional(),
  mode: z.enum(['full', 'moments']),
  window: z.number().int().min(10).max(600),
})

stations.get('/stations', async (c) => c.json(await stationStore.listStations()))
// Every station card's pictures and count in one answer. `day` seeds the shuffle; each `q` is
// an ad hoc query (the quick-start cards) as JSON, answered under that same string.
stations.get('/stations/previews', async (c) => {
  const day = parse(z.coerce.number().int().nonnegative(), c.req.query('day') ?? 0)
  const json = (s: string) => {
    try {
      return JSON.parse(s) as unknown
    } catch {
      return undefined
    }
  }
  const queries = (c.req.queries('q') ?? []).slice(0, 12).map((key) => ({ key, query: parse(sceneQuery, json(key)) }))
  return c.json(await stationStore.previews(day, queries))
})
stations.get('/stations/resume', async (c) => c.json(await stationStore.listResume()))
stations.put('/stations/resume', async (c) => {
  const b = parse(
    z.object({ key: z.string().min(3).max(2000), sceneId: z.string().regex(/^\d+$/), seconds: z.number().min(0).max(86_400) }),
    await body(c),
  )
  await stationStore.saveResume(b.key, b.sceneId, b.seconds)
  return c.body(null, 204)
})
stations.post('/stations', async (c) => {
  const b = parse(stationBody, await body(c))
  return c.json({ id: await stationStore.addStation(b) }, 201)
})
stations.put('/stations/order', async (c) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int()).max(200) }), await body(c))
  await stationStore.reorderStations(ids)
  return c.body(null, 204)
})
stations.put('/stations/:id', async (c) => {
  const b = parse(stationBody.omit({ from: true }).partial(), await body(c))
  await stationStore.updateStation(rowId(c.req.param('id')), b)
  return c.body(null, 204)
})
stations.delete('/stations/:id', async (c) => {
  await stationStore.deleteStation(rowId(c.req.param('id')))
  return c.body(null, 204)
})
