import { Hono } from 'hono'
import { z } from 'zod'
import * as pl from '../playlists.ts'
import { body, itemsBody, notFound, parse, rowId, sceneId } from './shared.ts'

export const playlists = new Hono()

// --- favorites (the built-in playlist behind the heart on videos) ------------------

playlists.get('/favorites', async (c) => c.json(await pl.favoriteIds()))

playlists.post('/favorites', async (c) => {
  const ids = parse(itemsBody, await body(c))
  await pl.addManyToPlaylist(await pl.favoritesPlaylist(), ids)
  return c.body(null, 204)
})

playlists.put('/favorites/:sceneId', async (c) => {
  const id = sceneId(c.req.param('sceneId'))
  await pl.addToPlaylist(await pl.favoritesPlaylist(), id)
  return c.body(null, 204)
})

playlists.delete('/favorites/:sceneId', async (c) => {
  const id = sceneId(c.req.param('sceneId'))
  await pl.removeFromPlaylist(await pl.favoritesPlaylist(), id)
  return c.body(null, 204)
})

playlists.get('/scenes/:id/playlists', async (c) =>
  c.json((await pl.playlistsContaining(sceneId(c.req.param('id')))).map((p) => p.id)),
)

const playlistBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
})

playlists.get('/playlists', async (c) => c.json(await pl.listPlaylists()))

playlists.post('/playlists', async (c) => {
  const b = parse(playlistBody.extend({ sceneId: z.string().regex(/^\d+$/).optional() }), await body(c))
  const id = await pl.createPlaylist(b.name, b.description ?? null)
  if (b.sceneId) await pl.addToPlaylist(id, b.sceneId)
  return c.json({ id }, 201)
})

playlists.get('/playlists/:id', async (c) => c.json((await pl.getPlaylist(rowId(c.req.param('id')))) ?? notFound()))

playlists.put('/playlists/:id', async (c) => {
  const b = parse(playlistBody, await body(c))
  await pl.updatePlaylist(rowId(c.req.param('id')), b.name, b.description ?? null)
  return c.body(null, 204)
})

playlists.delete('/playlists/:id', async (c) => {
  await pl.deletePlaylist(rowId(c.req.param('id')))
  return c.body(null, 204)
})

playlists.post('/playlists/:id/items', async (c) => {
  const ids = parse(itemsBody, await body(c))
  await pl.addManyToPlaylist(rowId(c.req.param('id')), ids)
  return c.body(null, 204)
})

playlists.delete('/playlists/:id/items/:sceneId', async (c) => {
  await pl.removeFromPlaylist(rowId(c.req.param('id')), sceneId(c.req.param('sceneId')))
  return c.body(null, 204)
})

playlists.put('/playlists/:id/order', async (c) => {
  const { sceneIds } = parse(z.object({ sceneIds: z.array(z.string().regex(/^\d+$/)).max(5000) }), await body(c))
  await pl.reorderPlaylist(rowId(c.req.param('id')), sceneIds)
  return c.body(null, 204)
})
