import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { type Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { compress } from 'hono/compress'
import { logger } from 'hono/logger'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { admin } from './admin.ts'
import { api, homeRows } from './api.ts'
import { auth, requireSession } from './auth.ts'
import { exclusions } from './blocklist.ts'
import { config } from './config.ts'
import { migrateDb, pingDb } from './db/index.ts'
import { assetCache, media } from './media.ts'
import { playbackScene } from './signing.ts'
import { scheduleWarm } from './warm.ts'
import { dataCache, noteActivity, onStashChange, sceneFacets, startChangeDetection, StashError, tagTiles } from './stash.ts'

const app = new Hono()
const VERSION = process.env.FLIX_VERSION ?? 'dev'

app.use('/api/*', logger())
app.use('/api/*', compress()) // JSON lists compress 5-10x; assets and video are already compact
// Liveness, and which build this is: the deploy workflow waits for its commit to appear here
// before smoke-testing the rollout.
app.get('/healthz', (c) => c.json({ ok: true, version: VERSION }))
// Readiness is "can serve", which means the database answers; Stash being busy (a scan
// holds its SQLite lock for minutes) must not take flix out of rotation, the caches cover it.
app.get('/readyz', async (c) => {
  try {
    await pingDb()
    return c.text('ok')
  } catch (e) {
    return c.text(`database unreachable: ${(e as Error).message}`, 503)
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
  // The page names its build, so an open app can tell when the server has moved on and reload
  // (web lib/update.ts). It is revalidated on every load; only the hashed assets are cached.
  const index = (await readFile(join(dist, 'index.html'), 'utf8')).replace('</head>', `<meta name="flix-version" content="${VERSION}" /></head>`)
  const page = (c: Context) => {
    c.header('cache-control', 'no-cache')
    return c.html(index)
  }
  app.use('/assets/*', async (c, next) => {
    await next()
    if (c.res.ok) c.header('cache-control', 'public, max-age=31536000, immutable')
  })
  app.get('/', page)
  app.get('/index.html', page)
  app.use(
    '/*',
    serveStatic({
      root: dist,
      // the manifest, icons and the rest of public/ are revalidated too
      onFound: (_path, c) => {
        if (!c.req.path.startsWith('/assets/')) c.header('cache-control', 'no-cache')
      },
    }),
  )
  // An asset this build does not have is a 404, never the page: an app still running an older
  // build asks for its own chunks, and HTML in their place fails in a way nothing can catch.
  app.get('/assets/*', (c) => c.notFound())
  // Client-side routes
  app.get('*', (c) => (c.req.path.startsWith('/api/') || c.req.path.startsWith('/media/') ? c.notFound() : page(c)))
}

await migrateDb()

// Query results survive restarts (deploys, and every edit under `node --watch`): restored
// here, saved every few minutes and on shutdown. Then the home feed is warmed in the
// background, and again whenever Stash changes, so nobody waits for a cold build.
const dataFile = join(config.cache.dir, 'data.json')
const restored = await dataCache.load(dataFile)
if (restored) console.log(`restored ${restored} cached queries`)
const saveData = () => dataCache.save(dataFile).catch((e) => console.error('saving query cache:', e.message))
setInterval(saveData, 2 * 60_000).unref()
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void saveData().finally(() => process.exit(0))
  })
}
// Warm what the first screens read: the home feed, the filter dialog's counts and Categories.
const warm = () =>
  void (async () => {
    await homeRows()
    const blocked = await exclusions()
    await Promise.all([sceneFacets({}, blocked), tagTiles(blocked)])
  })().catch((e) => console.error('warming:', e.message))
warm()
onStashChange(warm)

startChangeDetection()
scheduleWarm()
setInterval(() => assetCache.flushAccessTimes(), 10 * 60_000).unref()
serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`flix listening on :${info.port}`))
