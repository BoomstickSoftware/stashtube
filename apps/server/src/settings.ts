import type { Settings } from '@flix/shared'
import { FEATURED_DEFAULTS } from './featured.ts'
import { db } from './db/index.ts'
import { settings } from './db/schema.ts'

const defaults: Settings = { performerGender: 'women', introSkip: {}, panicUrl: 'https://www.google.com/', playOnOpen: false, people: {}, featured: FEATURED_DEFAULTS, whisparrSync: false, hideVr: true, continueDays: 30 }

// Single replica, so an in-memory copy is authoritative after the first read.
let cache: Settings | null = null

export async function getSettings(): Promise<Settings> {
  if (cache) return cache
  const rows = await db.select().from(settings)
  // `job:<name>` rows are the job registry's (jobs.ts), not settings
  const stored = Object.fromEntries(rows.filter((r) => !r.key.startsWith('job:')).map((r) => [r.key, r.value])) as Partial<Settings>
  // a dial added since the row was saved keeps its default
  cache = { ...defaults, ...stored, featured: { ...FEATURED_DEFAULTS, ...stored.featured } }
  return cache
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
  cache = null
}
