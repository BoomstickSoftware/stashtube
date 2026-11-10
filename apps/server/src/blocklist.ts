import type { BlockKind, Blocklist } from '@flix/shared'
import { and, eq } from 'drizzle-orm'
import { db } from './db/index.ts'
import { blocks } from './db/schema.ts'
import { unlistedSets } from './unlisted.ts'
import { getSettings } from './settings.ts'
import { dataCache, HOME } from './cache/data.ts'
import { type Exclusions, firstSceneYear, stashIdsOf } from './stash.ts'

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

// What the blocklist means outside the library, where Stash's ids do not exist: blocked
// performers and studios by their StashDB ids, blocked categories by lower-case name (Stash's
// tags carry no StashDB id). One reading for Discover (catalog.ts), discovery (getqueue.ts),
// the guard (sync.ts) and the not-downloaded shelf (unlisted.ts). Throws when Stash does not
// answer for an id it has not cached: "no answer" is never read as "nothing blocked". `lenient`
// (the shelf, which is only a display) skips such an id instead.
export interface StashDbIdSets {
  performers: Set<string>
  studios: Set<string>
  tagNames: Set<string>
}
export async function stashDbIdSets(rows: { kind: string; stashId: string; name: string }[], lenient = false): Promise<StashDbIdSets> {
  const one = (kind: 'performer' | 'studio', id: string) => (lenient ? stashIdsOf(kind, id).catch(() => [] as string[]) : stashIdsOf(kind, id))
  const ids = async (kind: 'performer' | 'studio') => new Set((await Promise.all(rows.filter((r) => r.kind === kind).map((r) => one(kind, r.stashId)))).flat())
  const [performers, studios] = await Promise.all([ids('performer'), ids('studio')])
  return { performers, studios, tagNames: new Set(rows.filter((r) => r.kind === 'tag').map((r) => r.name.toLowerCase())) }
}
export const blockedStashDbIds = async (lenient = false): Promise<StashDbIdSets> => stashDbIdSets(await db.select().from(blocks), lenient)

// The cached home feed carries the not-downloaded shelf's neighbours; drop it on a change.
export async function block(kind: BlockKind, stashId: string, name: string) {
  await db.insert(blocks).values({ kind, stashId, name }).onConflictDoNothing()
  dataCache.invalidate(HOME)
}

export async function unblock(kind: BlockKind, stashId: string) {
  await db.delete(blocks).where(and(eq(blocks.kind, kind), eq(blocks.stashId, stashId)))
  dataCache.invalidate(HOME)
}
