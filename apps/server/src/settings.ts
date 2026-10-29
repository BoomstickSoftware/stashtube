import type { PerformerGender, Settings } from '@flix/shared'
import type { GenderCriterionInput } from './stash.schema.ts'
import { db } from './db/index.ts'
import { settings } from './db/schema.ts'

const defaults: Settings = { performerGender: 'women', introSkip: {}, panicUrl: 'https://www.google.com/', playOnOpen: false, people: {} }

// Single replica, so an in-memory copy is authoritative after the first read.
let cache: Settings | null = null

export async function getSettings(): Promise<Settings> {
  if (cache) return cache
  const rows = await db.select().from(settings)
  cache = { ...defaults, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) } as Settings
  return cache
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
  cache = null
}

// Whether a performer of Stash gender `g` passes the performer-list setting.
export function genderAllows(setting: PerformerGender, g: string | null): boolean {
  if (setting === 'women') return g !== 'MALE'
  if (setting === 'men') return g === 'MALE'
  return true
}

// Stash GenderEnum criterion for a performer-list setting.
export function genderCriterion(g: PerformerGender): GenderCriterionInput | null {
  if (g === 'women') return { value_list: ['MALE'], modifier: 'EXCLUDES' }
  if (g === 'men') return { value: 'MALE', modifier: 'EQUALS' }
  return null
}
