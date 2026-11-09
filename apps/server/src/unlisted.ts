import type { BlockKind, Unlisted, WantedScene } from '@flix/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from './db/index.ts'
import { sdbScenes, unlisted } from './db/schema.ts'
import * as stash from './stash.ts'
import { dataCache, type Exclusions, HOME, type UnlistedSets } from './stash.ts'

// Unlisted (wiki features/vault): a category, performer, studio or one video (the "Unlisted"
// Stash tag) whose videos stay out of everything flix picks for you: Home and its rows, Featured,
// related videos of anything not Unlisted for the same reasons, stations, the not-downloaded
// shelf, category pictures, and the affinity behind recommendations. Browse, search, entity pages,
// History and playlists still show them; the Vault lists only them. Never blocked at once: the
// API clears one when the other is set.

// Read on every listing; cached in memory and dropped on write (single replica).
let cache: Unlisted | null = null

export async function unlistedList(): Promise<Unlisted> {
  if (!cache) {
    const rows = await db.select().from(unlisted).orderBy(unlisted.name)
    const of = (k: BlockKind) => rows.filter((r) => r.kind === k).map((r) => ({ id: r.stashId, name: r.name }))
    cache = { tags: of('tag'), performers: of('performer'), studios: of('studio'), sceneTag: null }
  }
  return { ...cache, sceneTag: await stash.unlistedTag() }
}

// The ids every query needs; the hand-unlist tag counts as an Unlisted category.
export async function unlistedSets(): Promise<UnlistedSets> {
  const u = await unlistedList()
  const ids = (r: { id: string }[]) => r.map((x) => x.id)
  return { tags: u.sceneTag ? [...new Set([...ids(u.tags), u.sceneTag])] : ids(u.tags), performers: ids(u.performers), studios: ids(u.studios) }
}

// Lists are keyed by their exclusions, so they miss on their own; the cached home feed is not.
export async function unlist(kind: BlockKind, stashId: string, name: string) {
  await db.insert(unlisted).values({ kind, stashId, name }).onConflictDoUpdate({ target: [unlisted.kind, unlisted.stashId], set: { name } })
  cache = null
  dataCache.invalidate(HOME)
}

export async function relist(kind: BlockKind, stashId: string) {
  await db.delete(unlisted).where(and(eq(unlisted.kind, kind), eq(unlisted.stashId, stashId)))
  cache = null
  dataCache.invalidate(HOME)
}

// The exclusions for a view flix assembles (Home and its rows, Featured, stations): Unlisted out.
export const curated = (ex: Exclusions): Exclusions => ({ ...ex, holdUnlisted: true })

// Related videos of a scene: its Unlisted reasons, which an Unlisted candidate must all share
// (null when it has none: then no Unlisted video qualifies and Stash leaves them out).
export function relatedSide(marks: Parameters<typeof stash.unlistedReasons>[0], ex: Exclusions): Set<string> | null {
  const reasons = ex.unlisted ? stash.unlistedReasons(marks, ex.unlisted) : new Set<string>()
  return reasons.size ? reasons : null
}

// The not-downloaded shelf on Home (StashDB scenes): drop those with an Unlisted performer or
// studio (by their StashDB ids) or an Unlisted category (by name, case-insensitive; StashDB's tag
// ids are not Stash's). Matched through flix's StashDB mirror, so a scene the mirror has never
// seen is judged only by the followed performers it came from.
export async function dropUnlistedWanted(items: WantedScene[]): Promise<WantedScene[]> {
  const u = await unlistedList()
  if (!items.length || (!u.tags.length && !u.performers.length && !u.studios.length)) return items
  const [perfIds, studioIds] = await Promise.all([
    Promise.all(u.performers.map((p) => stash.stashIdsOf('performer', p.id).catch(() => []))).then((x) => new Set(x.flat())),
    Promise.all(u.studios.map((s) => stash.stashIdsOf('studio', s.id).catch(() => []))).then((x) => new Set(x.flat())),
  ])
  const tagNames = new Set(u.tags.map((t) => t.name.toLowerCase()))
  const ids = items.map((i) => i.stashdbId).filter((x): x is string => !!x)
  const rows = ids.length ? await db.select({ id: sdbScenes.id, performerIds: sdbScenes.performerIds, studioId: sdbScenes.studioId, tags: sdbScenes.tags }).from(sdbScenes).where(inArray(sdbScenes.id, ids)) : []
  const byId = new Map(rows.map((r) => [r.id, r]))
  return items.filter((i) => {
    const r = i.stashdbId ? byId.get(i.stashdbId) : undefined
    if (!r) return true
    return !(
      r.performerIds.some((p) => perfIds.has(p)) ||
      (!!r.studioId && studioIds.has(r.studioId)) ||
      (r.tags as { name: string }[]).some((t) => tagNames.has(t.name.toLowerCase()))
    )
  })
}
