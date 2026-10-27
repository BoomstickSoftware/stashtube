import type { CacheScope, CacheStats } from '@flix/shared'
import { Hono } from 'hono'
import { config } from './config.ts'
import { assetCache } from './media.ts'
import { dataCache, upstream } from './stash.ts'
import { startWarm, warmStatus } from './warm.ts'

export const admin = new Hono()

const startedAt = new Date().toISOString()

admin.get('/cache', (c) =>
  c.json({
    since: startedAt,
    data: { ...dataCache.stats(), ttlMinutes: config.cache.dataTtl / 60_000 },
    assets: { ...assetCache.stats(), ttlHours: config.cache.assetTtl / 3_600_000 },
    upstream: { ...upstream },
    changePollSeconds: config.cache.pollInterval / 1000,
    warm: warmStatus(),
  } satisfies CacheStats),
)

admin.post('/cache/clear', async (c) => {
  const { scope } = (await c.req.json().catch(() => ({}))) as { scope?: CacheScope }
  if (scope !== 'data' && scope !== 'assets' && scope !== 'all') return c.json({ error: 'scope must be data, assets or all' }, 400)
  if (scope !== 'assets') dataCache.clear()
  if (scope !== 'data') await assetCache.clear()
  console.log(`cache cleared: ${scope}`)
  return c.body(null, 204)
})

// Pre-fetch all artwork now (the same job that runs nightly).
admin.post('/cache/warm', (c) => {
  startWarm()
  return c.json(warmStatus(), 202)
})
