import type { Features } from '@flix/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import { config } from '../config.ts'
import { expireContinue } from '../continue.ts'
import { sanitizeWeights } from '../featured.ts'
import { homeChanged } from '../home.ts'
import { getSettings, setSetting } from '../settings.ts'
import * as stashdb from '../stashdb.ts'
import { kickSync, runSync } from '../sync.ts'
import { body, idParam, parse, people, weightsBody } from './shared.ts'

export const settings = new Hono()

settings.get('/features', async (c) => {
  const sdb = !!config.whisparr && (await stashdb.available())
  return c.json({ deleteScenes: !!config.whisparr, whisparr: !!config.whisparr, stashdb: sdb, stashdbWeb: sdb ? await stashdb.webUrl() : null, reels: config.reels } satisfies Features)
})

settings.get('/settings', async (c) => c.json(await getSettings()))

settings.put('/settings', async (c) => {
  const b = parse(
    z
      .object({ performerGender: z.enum(['women', 'men', 'all']), panicUrl: z.url({ protocol: /^https?$/ }), playOnOpen: z.boolean(), people, featured: weightsBody, whisparrSync: z.boolean(), hideVr: z.boolean(), continueDays: z.number().int().min(0).max(365) })
      .partial(),
    await body(c),
  )
  // still accepted and stored, read by nothing since 2026-10-31 (gender-switch-performers-page-only)
  if (b.performerGender) await setSetting('performerGender', b.performerGender)
  if (b.panicUrl) await setSetting('panicUrl', b.panicUrl)
  if (b.playOnOpen !== undefined) await setSetting('playOnOpen', b.playOnOpen)
  if (b.whisparrSync !== undefined) {
    await setSetting('whisparrSync', b.whisparrSync)
    if (b.whisparrSync) kickSync()
    else void runSync().catch(() => {}) // one plan, so Settings shows the switch's new state
  }
  if (b.people) await setSetting('people', b.people)
  if (b.hideVr !== undefined) await setSetting('hideVr', b.hideVr)
  if (b.continueDays !== undefined) {
    await setSetting('continueDays', b.continueDays)
    void expireContinue().catch((e) => console.error('continue expiry:', e.message))
  }
  if (b.featured) await setSetting('featured', sanitizeWeights(b.featured, (await getSettings()).featured))
  if (b.people || b.featured) homeChanged() // the feed was built with the old defaults or dials
  return c.json(await getSettings())
})

// Seconds to skip at the start of this studio's videos; null clears it.
settings.put('/studios/:id/intro', async (c) => {
  const id = idParam(c) // a studio id, not any key
  const { seconds } = parse(z.object({ seconds: z.number().min(0).max(600).nullable() }), await body(c))
  const skip = { ...(await getSettings()).introSkip }
  if (seconds && Math.round(seconds) > 0) skip[id] = Math.round(seconds)
  else delete skip[id]
  await setSetting('introSkip', skip)
  return c.json(await getSettings())
})
