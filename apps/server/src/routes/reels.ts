// Reels (wiki decisions/reels-edit-by-reference). Every route answers 404 until reels are
// switched on (FLIX_REELS=1).
import { reelTransitions } from '@flix/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import { config } from '../config.ts'
import * as builds from '../reelBuilds.ts'
import * as r from '../reels.ts'
import { body, notFound, parse, refused, rowId } from './shared.ts'

export const reels = new Hono()

reels.use('/reels/*', async (_c, next) => (config.reels ? next() : notFound()))
reels.use('/reels', async (_c, next) => (config.reels ? next() : notFound()))
reels.use('/reel-builds/*', async (_c, next) => (config.reels ? next() : notFound()))

const transition = z.enum(reelTransitions)
const name = z.string().trim().min(1).max(120)
const seconds = z.number().finite().min(0).max(86_400)
const sceneIdBody = z.string().regex(/^\d+$/)

reels.get('/reels', async (c) => c.json(await r.listReels()))

reels.post('/reels', async (c) => {
  const b = parse(z.object({ name, transition: transition.optional() }), await body(c))
  return c.json({ id: await r.createReel(b.name, b.transition) }, 201)
})

reels.get('/reels/:id', async (c) => c.json((await r.getReel(rowId(c.req.param('id')))) ?? notFound()))

reels.put('/reels/:id', async (c) => {
  const b = parse(z.object({ name: name.optional(), transition: transition.optional() }), await body(c))
  if (!(await r.updateReel(rowId(c.req.param('id')), b))) notFound()
  return c.body(null, 204)
})

reels.delete('/reels/:id', async (c) => {
  await r.deleteReel(rowId(c.req.param('id')))
  return c.body(null, 204)
})

reels.post('/reels/:id/clips', async (c) => {
  const b = parse(z.object({ sceneId: sceneIdBody, start: seconds, end: seconds }), await body(c))
  const id = await refused(400, () => r.addClip(rowId(c.req.param('id')), b.sceneId, b.start, b.end))
  return c.json({ id }, 201)
})

// literal before `:clipId`
reels.put('/reels/:id/clips/order', async (c) => {
  const { clipIds } = parse(z.object({ clipIds: z.array(z.number().int().positive()).max(2000) }), await body(c))
  await r.reorderClips(rowId(c.req.param('id')), clipIds)
  return c.body(null, 204)
})

reels.put('/reels/:id/clips/:clipId', async (c) => {
  const b = parse(z.object({ start: seconds.optional(), end: seconds.optional(), transition: transition.nullable().optional() }), await body(c))
  const ok = await refused(400, () => r.updateClip(rowId(c.req.param('id')), rowId(c.req.param('clipId')), b))
  if (!ok) notFound()
  return c.body(null, 204)
})

reels.delete('/reels/:id/clips/:clipId', async (c) => {
  if (!(await r.removeClip(rowId(c.req.param('id')), rowId(c.req.param('clipId'))))) notFound()
  return c.body(null, 204)
})

// --- building (wiki features/reel-builds) -----------------------------------------

// Queue the reel for the nightly window, or with `now` for as soon as the builder asks.
reels.post('/reels/:id/build', async (c) => {
  const b = parse(z.object({ now: z.boolean().optional() }), await body(c))
  const id = await refused(409, () => builds.queueBuild(rowId(c.req.param('id')), b.now === true))
  return c.json({ id }, 201)
})

reels.delete('/reels/:id/build', async (c) => {
  if (!(await builds.cancelBuild(rowId(c.req.param('id'))))) notFound()
  return c.body(null, 204)
})

// The builder's side. It runs on the NAS and calls flix by IP, with no login: these answer
// only what a build needs and accept only reports about a build that is being rendered.
reels.post('/reel-builds/claim', async (c) => {
  const job = await builds.claimBuild()
  return job ? c.json(job) : c.body(null, 204)
})

reels.get('/reel-builds/files', async (c) => c.json(await builds.builtFiles()))

reels.post('/reel-builds/:id/progress', async (c) => {
  const b = parse(z.object({ progress: z.number().min(0).max(1), message: z.string().max(200).nullable().optional() }), await body(c))
  return c.json({ continue: await builds.reportProgress(rowId(c.req.param('id')), b.progress, b.message ?? null) })
})

reels.post('/reel-builds/:id/done', async (c) => {
  const b = parse(z.object({ file: z.string().max(80), durationSec: z.number().positive(), sizeBytes: z.number().positive() }), await body(c))
  if (!(await refused(400, () => builds.finishBuild(rowId(c.req.param('id')), b)))) notFound()
  return c.body(null, 204)
})

reels.post('/reel-builds/:id/fail', async (c) => {
  const b = parse(z.object({ error: z.string().max(2000) }), await body(c))
  if (!(await builds.failBuild(rowId(c.req.param('id')), b.error))) notFound()
  return c.body(null, 204)
})

