import type { PerformerGender, Settings } from '@flix/shared'
import { FEATURED_DEFAULTS } from './featured.ts'
import type { GenderCriterionInput } from './stash.schema.ts'
import { db } from './db/index.ts'
import { settings } from './db/schema.ts'

const defaults: Settings = { performerGender: 'women', introSkip: {}, panicUrl: 'https://www.google.com/', playOnOpen: false, people: {}, featured: FEATURED_DEFAULTS, whisparrSync: false, hideVr: true }

// Single replica, so an in-memory copy is authoritative after the first read.
let cache: Settings | null = null

export async function getSettings(): Promise<Settings> {
  if (cache) return cache
  const rows = await db.select().from(settings)
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Settings>
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

// Stash GenderEnum criterion for the Performers page's Women / Men / Everyone switch. Only that
// page reads it; `settings.performerGender` is still stored but read by nothing since
// 2026-10-31 (decisions/gender-switch-performers-page-only).
export function genderCriterion(g: PerformerGender): GenderCriterionInput | null {
  if (g === 'women') return { value_list: ['MALE'], modifier: 'EXCLUDES' }
  if (g === 'men') return { value: 'MALE', modifier: 'EQUALS' }
  return null
}
