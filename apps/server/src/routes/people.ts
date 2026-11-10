import type { SearchResult } from '@flix/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import { exclusions } from '../blocklist.ts'
import { byNameMatch } from '../rank.ts'
import * as stash from '../stash.ts'
import { kickSync } from '../sync.ts'
import { body, idParam, listQuery, notFound, parse, ratingBody } from './shared.ts'

export const people = new Hono()

people.get('/performers', async (c) => {
  const q = parse(listQuery, c.req.query())
  const page = q.page ?? 1
  const perPage = q.perPage ?? 60
  const r = await stash.findPerformers(
    stash.findFilter({ ...q, sort: q.sort ?? 'scenes_count', dir: q.dir ?? (q.sort === 'name' ? 'asc' : 'desc'), page, perPage }),
    { only: q.favorites ? 'favorites' : 'used', gender: q.gender ?? 'all' }, // the page's own switch, kept per browser (gender-switch-performers-page-only)
  )
  return c.json({ ...r, page, perPage })
})

people.get('/performers/:id', async (c) => c.json((await stash.getPerformer(idParam(c))) ?? notFound()))

people.put('/performers/:id/favorite', async (c) => {
  const id = idParam(c)
  const { favorite } = parse(z.object({ favorite: z.boolean() }), await body(c))
  await stash.setPerformerFavorite(id, favorite)
  kickSync() // Whisparr follows the follow, a little later and never in this request
  return c.body(null, 204)
})

people.put('/performers/:id/rating', async (c) => {
  const id = idParam(c)
  const { rating } = parse(ratingBody, await body(c))
  await stash.setPerformerRating(id, rating)
  return c.body(null, 204)
})

people.get('/studios', async (c) => {
  const q = parse(listQuery, c.req.query())
  const page = q.page ?? 1
  const perPage = q.perPage ?? 60
  const r = await stash.findStudios(
    stash.findFilter({ ...q, sort: q.sort ?? 'scenes_count', dir: q.dir ?? (q.sort === 'name' ? 'asc' : 'desc'), page, perPage }),
  )
  return c.json({ ...r, page, perPage })
})

people.get('/studios/:id', async (c) => c.json((await stash.getStudio(idParam(c))) ?? notFound()))

people.put('/studios/:id/favorite', async (c) => {
  const id = idParam(c)
  const { favorite } = parse(z.object({ favorite: z.boolean() }), await body(c))
  await stash.setStudioFavorite(id, favorite)
  return c.body(null, 204)
})

people.get('/tags', async (c) => {
  const q = parse(listQuery, c.req.query())
  const page = q.page ?? 1
  const perPage = q.perPage ?? 200
  const r = await stash.findTags(
    stash.findFilter({ ...q, sort: q.sort ?? 'scenes_count', dir: q.dir ?? (q.sort === 'name' ? 'asc' : 'desc'), page, perPage }),
  )
  // a name search: what the term names first (rank.ts); Filters shows the first 10
  return c.json({ ...r, items: q.q ? byNameMatch(r.items, q.q, (t) => t.name) : r.items, page, perPage })
})

people.get('/tags/tiles', async (c) => c.json(await stash.tagTiles(await exclusions())))

people.get('/tags/:id', async (c) => c.json((await stash.getTag(idParam(c))) ?? notFound()))

people.put('/tags/:id/favorite', async (c) => {
  const id = idParam(c)
  const { favorite } = parse(z.object({ favorite: z.boolean() }), await body(c))
  await stash.setTagFavorite(id, favorite)
  return c.body(null, 204)
})

// Typeahead: a few of each kind; the scenes with the list defaults applied.
people.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 200)
  if (!q) return c.json({ scenes: [], performers: [], studios: [], tags: [] } satisfies SearchResult)
  const blocked = await exclusions()
  const f = { q, perPage: 6 }
  // the most-used 30 of each, then what the term names first (rank.ts), so an exact name with few
  // videos is not crowded out by longer ones with more (_6 by count until 2026-11-09_)
  const wide = { q, perPage: 30, sort: 'scenes_count' }
  const top = <T extends { name: string }>(r: { items: T[] }) => byNameMatch(r.items, q, (x) => x.name).slice(0, 6)
  const [scenes, performers, studios, tags] = await Promise.all([
    stash.findScenes(stash.findFilter(f), stash.sceneFilter({}, blocked)),
    stash.findPerformers(stash.findFilter(wide)),
    stash.findStudios(stash.findFilter(wide)),
    stash.findTags(stash.findFilter(wide)),
  ])
  return c.json({
    scenes: scenes.items,
    performers: top(performers),
    studios: top(studios),
    tags: top(tags),
  } satisfies SearchResult)
})
