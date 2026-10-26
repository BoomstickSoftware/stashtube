import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { admin } from './admin.ts'
import { api } from './api.ts'
import { auth, requireSession } from './auth.ts'
import { config } from './config.ts'
import { migrateDb } from './db/index.ts'
import { assetCache, media } from './media.ts'
import { playbackScene } from './signing.ts'
import { noteActivity, startChangeDetection, stashVersion, StashError } from './stash.ts'

const app = new Hono()

app.use('/api/*', logger())
app.get('/healthz', (c) => c.text('ok'))
app.get('/readyz', async (c) => {
  try {
    await stashVersion()
    return c.text('ok')
  } catch (e) {
    return c.text(`stash unreachable: ${(e as Error).message}`, 503)
  }
})

// Playback may come from MEDIA_ORIGIN while the page is on another host (flix.lan vs the IP);
// hls.js then fetches playlists and segments cross-origin. They are authorised by their
// signed token, not cookies, so any origin may read them.
app.use('/media/*', async (c, next) => {
  if (!playbackScene(c.req.path)) return next()
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'range',
      'access-control-max-age': '86400',
    })
  }
  await next()
  c.header('access-control-allow-origin', '*')
  c.header('access-control-expose-headers', 'content-length, content-range, accept-ranges')
})

app.route('/api/auth', auth)
app.use('/api/*', requireSession)
app.use('/media/*', requireSession)
app.use('/api/*', async (_c, next) => {
  noteActivity()
  await next()
})
app.route('/api/admin', admin)
app.route('/api', api)
app.route('/media', media)

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  if (err instanceof StashError) {
    console.error('stash:', err.message)
    return c.json({ error: `Stash: ${err.message}` }, 502)
  }
  if ((err as Error).name === 'AbortError') return c.body(null, 499 as 400)
  console.error(err)
  return c.json({ error: 'internal error' }, 500)
})

if (config.webDist) {
  const dist = config.webDist
  const index = await readFile(join(dist, 'index.html'), 'utf8')
  app.use('/assets/*', async (c, next) => {
    await next()
    c.header('cache-control', 'public, max-age=31536000, immutable')
  })
  app.use('/*', serveStatic({ root: dist }))
  // Client-side routes
  app.get('*', (c) => (c.req.path.startsWith('/api/') || c.req.path.startsWith('/media/') ? c.notFound() : c.html(index)))
}

await migrateDb()
startChangeDetection()
setInterval(() => assetCache.flushAccessTimes(), 10 * 60_000).unref()
serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`flix listening on :${info.port}`))
