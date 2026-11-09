import type { EduTags } from '@flix/shared'
import { eq } from 'drizzle-orm'
import { db } from './db/index.ts'
import { eduTags } from './db/schema.ts'
import { dataCache, type Exclusions, HOME } from './stash.ts'

// The Edu section (wiki features/edu-section): the categories listed here mark a video as Edu.
// Edu videos stay out of what flix picks for you (Home, Featured, For you, related videos,
// stations) and out of the affinity behind those picks; Browse, search and the entity pages show
// them like any video, and /edu lists only them.

// Read on every listing; cached in memory and dropped on write (single replica).
let cache: EduTags | null = null

export async function eduTagList(): Promise<EduTags> {
  cache ??= (await db.select().from(eduTags).orderBy(eduTags.name)).map((r) => ({ id: r.stashId, name: r.name }))
  return cache
}

export const eduTagIds = async () => (await eduTagList()).map((t) => t.id)

// Lists are keyed by their exclusions, so they miss on their own; the cached home feed is not.
export async function addEduTag(stashId: string, name: string) {
  await db.insert(eduTags).values({ stashId, name }).onConflictDoUpdate({ target: eduTags.stashId, set: { name } })
  cache = null
  dataCache.invalidate(HOME)
}

export async function removeEduTag(stashId: string) {
  await db.delete(eduTags).where(eq(eduTags.stashId, stashId))
  cache = null
  dataCache.invalidate(HOME)
}

// The exclusions for a view flix assembles (Home and its rows, Featured, stations): Edu held out.
export const curated = (ex: Exclusions): Exclusions => ({ ...ex, holdEdu: true })

// Related videos stay on their side: an Edu video's related ones are Edu only, anyone else's
// leave Edu out. `within` goes to relatedScenes.
export function relatedSide(tagIds: string[], ex: Exclusions): { ex: Exclusions; within: string[] | null } {
  const edu = ex.eduTags ?? []
  return tagIds.some((t) => edu.includes(t)) ? { ex: { ...ex, holdEdu: false }, within: edu } : { ex: curated(ex), within: null }
}
