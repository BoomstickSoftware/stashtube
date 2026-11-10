// What the user curates by entity: the blocklist, Unlisted, Cast categories and studio default
// categories.
import { Hono } from 'hono'
import { z } from 'zod'
import { block, blocklist, unblock } from '../blocklist.ts'
import { castStatus, setOverride, syncCast } from '../cast.ts'
import * as stash from '../stash.ts'
import { setStudioCategories, studioCategoriesStatus, studioCategoryList, syncStudioCategories } from '../studioCategories.ts'
import { kickSync } from '../sync.ts'
import { relist, unlist, unlistedList } from '../unlisted.ts'
import { body, idParam, kind, notFound, parse } from './shared.ts'

export const curation = new Hono()

// --- blocklist ------------------------------------------------------------------

curation.get('/blocklist', async (c) => c.json(await blocklist()))

curation.put('/blocklist/:kind/:id', async (c) => {
  const k = parse(kind, c.req.param('kind'))
  const id = idParam(c)
  const name = await stash.namesFor(k, id)
  if (!name) return notFound()
  await block(k, id, name)
  kickSync() // a blocked performer or studio must not stay monitored in Whisparr
  return c.body(null, 204)
})

curation.delete('/blocklist/:kind/:id', async (c) => {
  await unblock(parse(kind, c.req.param('kind')), idParam(c))
  kickSync()
  return c.body(null, 204)
})

// --- Studio default categories (studioCategories.ts, wiki features/studio-default-categories) ---

curation.get('/studio-categories', async (c) => c.json(await studioCategoriesStatus()))
// writes categories in Stash (the user asked for studio defaults to be kept on its videos, 2026-11-09)
curation.post('/studio-categories/sync', async (c) => {
  await syncStudioCategories()
  return c.json(await studioCategoriesStatus())
})
curation.get('/studios/:id/categories', async (c) => c.json({ tags: await studioCategoryList(idParam(c)) }))
curation.put('/studios/:id/categories', async (c) => {
  const id = idParam(c)
  const { tagIds } = parse(z.object({ tagIds: z.array(z.string().regex(/^\d+$/)).max(50) }), await body(c))
  const studio = (await stash.getStudio(id)) ?? notFound()
  return c.json(await setStudioCategories(studio.id, studio.name, tagIds))
})

// --- Cast categories (cast.ts, wiki features/cast) ------------------------------------

curation.get('/cast', async (c) => c.json(await castStatus()))
// writes Cast categories in Stash (the user asked for these to be kept in sync, 2026-11-09)
curation.post('/cast/sync', async (c) => {
  await syncCast()
  return c.json(await castStatus())
})
// A video's cast by hand, when Stash's performers miss someone; DELETE goes back to the performers.
const castCount = z.object({ F: z.number().int().min(0).max(20), M: z.number().int().min(0).max(20), X: z.number().int().min(0).max(20) })
curation.put('/scenes/:id/cast', async (c) => {
  const id = idParam(c)
  const n = parse(castCount, await body(c))
  const r = await stash.getScene(id)
  if (!r) return notFound()
  await setOverride(id, n, r.scene.title)
  return c.body(null, 204)
})
curation.delete('/scenes/:id/cast', async (c) => {
  await setOverride(idParam(c), null)
  return c.body(null, 204)
})

// --- Unlisted (unlisted.ts, wiki features/vault) --------------------------------------

curation.get('/unlisted', async (c) => c.json(await unlistedList()))

// Videos unlisted by hand, for Settings.
curation.get('/unlisted/scenes', async (c) => c.json(await stash.unlistedScenes()))

curation.put('/unlisted/:kind/:id', async (c) => {
  const k = parse(kind, c.req.param('kind'))
  const id = idParam(c)
  const name = await stash.namesFor(k, id)
  if (!name) return notFound()
  await unlist(k, id, name)
  return c.body(null, 204)
})

curation.delete('/unlisted/:kind/:id', async (c) => {
  await relist(parse(kind, c.req.param('kind')), idParam(c))
  return c.body(null, 204)
})
