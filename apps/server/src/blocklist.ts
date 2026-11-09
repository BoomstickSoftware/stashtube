import type { BlockKind, Blocklist } from '@flix/shared'
import { and, eq } from 'drizzle-orm'
import { db } from './db/index.ts'
import { blocks } from './db/schema.ts'
import { unlistedSets } from './unlisted.ts'
import { getSettings } from './settings.ts'
import { dataCache, type Exclusions, firstSceneYear, hiddenTag, HOME } from './stash.ts'

// Read on every listing; cached in memory and invalidated on write (single replica).
let cache: Exclusions | null = null

// Also carries the Settings performer defaults (age, ethnicity), which every list applies.
export async function exclusions(): Promise<Exclusions> {
  if (!cache) {
    const rows = await db.select().from(blocks)
    cache = {
      tags: rows.filter((r) => r.kind === 'tag').map((r) => r.stashId),
      performers: rows.filter((r) => r.kind === 'performer').map((r) => r.stashId),
      studios: rows.filter((r) => r.kind === 'studio').map((r) => r.stashId),
    }
  }
  // videos marked "Not interested" stay out like a blocked tag
  const [settings, hidden, firstYear, unlisted] = await Promise.all([getSettings(), hiddenTag(), firstSceneYear(), unlistedSets()])
  return {
    ...cache,
    tags: hidden ? [...cache.tags, hidden] : cache.tags,
    // no gender: the Performers page's switch is that page's alone (gender-switch-performers-page-only)
    people: { firstYear, ...settings.people },
    // known to every query (the Vault asks for them); held out only where curated() says so
    unlisted,
  }
}

export async function blocklist(): Promise<Blocklist> {
  const rows = await db.select().from(blocks).orderBy(blocks.name)
  const of = (k: BlockKind) => rows.filter((r) => r.kind === k).map((r) => ({ id: r.stashId, name: r.name }))
  return { tags: of('tag'), performers: of('performer'), studios: of('studio') }
}

// Lists are keyed by their exclusions, so they miss on their own; the cached home feed is not.
export async function block(kind: BlockKind, stashId: string, name: string) {
  await db.insert(blocks).values({ kind, stashId, name }).onConflictDoNothing()
  cache = null
  dataCache.invalidate(HOME)
}

export async function unblock(kind: BlockKind, stashId: string) {
  await db.delete(blocks).where(and(eq(blocks.kind, kind), eq(blocks.stashId, stashId)))
  cache = null
  dataCache.invalidate(HOME)
}
