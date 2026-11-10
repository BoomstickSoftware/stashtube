import type { BlockKind, Blocklist } from '@flix/shared'
import { and, eq } from 'drizzle-orm'
import { db } from './db/index.ts'
import { blocks } from './db/schema.ts'
import { unlistedSets } from './unlisted.ts'
import { getSettings } from './settings.ts'
import { dataCache, type Exclusions, firstSceneYear, HOME } from './stash.ts'

// What every library list applies: the Settings performer defaults (age, ethnicity) and the
// Unlisted sets. The blocklist is not in it: since 2026-11-09 Block only stops downloads
// (Discover, the not-downloaded shelf, the Get queue), and videos you have show as normal
// (decisions/hide-means-delete-block-or-unlist). tags/performers/studios start empty and carry a
// query's own excludes.
export async function exclusions(): Promise<Exclusions> {
  const [settings, firstYear, unlisted] = await Promise.all([getSettings(), firstSceneYear(), unlistedSets()])
  return {
    tags: [],
    performers: [],
    studios: [],
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

// The cached home feed carries the not-downloaded shelf's neighbours; drop it on a change.
export async function block(kind: BlockKind, stashId: string, name: string) {
  await db.insert(blocks).values({ kind, stashId, name }).onConflictDoNothing()
  dataCache.invalidate(HOME)
}

export async function unblock(kind: BlockKind, stashId: string) {
  await db.delete(blocks).where(and(eq(blocks.kind, kind), eq(blocks.stashId, stashId)))
  dataCache.invalidate(HOME)
}
