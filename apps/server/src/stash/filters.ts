// Stash filter inputs built from flix's queries and exclusions, and the same exclusions applied
// to scenes Stash cannot filter.
// Generated from stash.schema.graphql (Stash's own schema; see codegen.ts). Filter inputs are
// exact: a criterion Stash does not have is a type error here instead of a 400 from Stash.
import { NOT_MP4_PATH, type PerformerGender, type SceneQuery } from '@flix/shared'
import type { DateCriterionInput, FindFilterType, GenderCriterionInput, PerformerFilterType, ResolutionEnum, Scene, SceneFilterType } from '../stash.schema.ts'

// --- filters --------------------------------------------------------------------

export interface Exclusions {
  tags: string[]
  performers: string[]
  studios: string[]
  people?: People
  unlisted?: UnlistedSets // Unlisted categories (with the hand-unlist tag), performers, studios (unlisted.ts)
  holdUnlisted?: boolean // leave Unlisted videos out (views flix assembles: unlisted.ts curated())
}

export interface UnlistedSets {
  tags: string[]
  performers: string[]
  studios: string[]
}

// Performer attributes a scene must have: one performer (of `gender`, when one is given; the
// Settings gender switch no longer feeds it, decisions/gender-switch-performers-page-only)
// matching the age at filming and any of the ethnicities. `firstYear` is the earliest scene date.
export interface People {
  gender?: GenderCriterionInput | null
  firstYear: number
  minAge?: number
  maxAge?: number
  ethnicities?: string[]
}

// Joins filters with OR (Stash nests them: a OR (b OR (c …))).
function anyOf<F extends { OR?: F | null }>(filters: F[]): F | null {
  if (!filters.length) return null
  return filters.reduceRight<F | null>((rest, f) => (rest ? { ...f, OR: rest } : f), null)
}

// The scene-level criterion for `People`, or null. Stash has no "age at filming" per performer,
// so scenes are matched in release-date buckets: a scene released around date D has a performer
// aged A..B if they were born between D-(B+1)y and D-Ay, with D the middle of the bucket. One
// bucket per year (right to about six months), wider if the library spans more than
// MAX_BUCKETS years: SQLite's parser overflows on long OR chains (36 failed, 18 worked).
// Contains OR, so it goes last in an AND chain.
const MAX_BUCKETS = 16

// The people criterion as the alternatives its OR chain joins (each a plain set of criteria), so
// the Vault's own alternatives can be multiplied in; `maxBuckets` keeps the product under MAX_OR.
function peopleAlternatives(p: People | undefined, maxBuckets = MAX_BUCKETS): SceneFilterType[] {
  if (!p || (!p.minAge && !p.maxAge && !p.ethnicities?.length)) return []
  const base: PerformerFilterType = p.gender ? { gender: p.gender } : {}
  const who: PerformerFilterType[] = p.ethnicities?.length ? p.ethnicities.map((e) => ({ ...base, ethnicity: { value: e, modifier: 'EQUALS' } })) : [base]
  if (!p.minAge && !p.maxAge) return [{ performers_filter: anyOf(who) }]
  const last = new Date().getFullYear()
  const step = Math.max(1, Math.ceil((last - p.firstYear + 1) / maxBuckets))
  const buckets: SceneFilterType[] = []
  for (let y = p.firstYear; y <= last; y += step) {
    const end = y + step - 1
    const mid = (y + end + 1) / 2 // in years; .5 is July 1
    const at = (years: number) => `${Math.floor(years)}-${years % 1 ? '07' : '01'}-01`
    const born: DateCriterionInput =
      p.minAge && p.maxAge
        ? { value: at(mid - p.maxAge - 1), value2: at(mid - p.minAge), modifier: 'BETWEEN' }
        : p.maxAge
          ? { value: at(mid - p.maxAge - 1), modifier: 'GREATER_THAN' }
          : { value: at(mid - p.minAge!), modifier: 'LESS_THAN' }
    buckets.push({
      date: { value: `${y}-01-01`, value2: `${end}-12-31`, modifier: 'BETWEEN' },
      performers_filter: anyOf<PerformerFilterType>(who.map((w) => ({ ...w, birthdate: born }))),
    })
  }
  return buckets
}

// The longest OR chain sent with the Vault: the Vault's alternatives times the age buckets stay at
// or under this. 32 overflowed SQLite's parser ("parser stack overflow", 27 buckets of three
// conditions, 2026-11-09); 16 is the people criterion's proven size.
const MAX_OR = MAX_BUCKETS

const ids = (csv?: string) => (csv ? csv.split(',').filter(Boolean) : [])

const minResolution: Record<number, ResolutionEnum> = {
  720: 'WEB_HD',
  1080: 'STANDARD_HD',
  2160: 'QUAD_HD',
}

// Stash allows one criterion per field per level, so each exclusion (and each extra criterion
// that may repeat a field) nests one AND deeper.
// `alternatives`: one of which a scene must match (the Vault); joined with the people criterion
// by distributing, since a filter holds one OR chain (Stash allows no AND beside an OR).
export function withExclusions(filter: SceneFilterType, ex: Exclusions, extra: SceneFilterType[] = [], alternatives: SceneFilterType[] = []): SceneFilterType {
  const parts: SceneFilterType[] = [...extra]
  // Unlisted ids join the blocked ones in the one criterion per field: a second `tags EXCLUDES`
  // (depth 0, its own AND level) was ignored by Stash, so Edu videos stayed on Home (2026-11-09,
  // wiki gotchas/second-tags-exclusion-ignored)
  const u = ex.holdUnlisted ? ex.unlisted : undefined
  const join = (a: string[], b: string[] = []) => (b.length ? [...new Set([...a, ...b])] : a)
  const tagsOut = join(ex.tags, u?.tags)
  const performersOut = join(ex.performers, u?.performers)
  const studiosOut = join(ex.studios, u?.studios)
  if (tagsOut.length) parts.push({ tags: { value: tagsOut, modifier: 'EXCLUDES', depth: -1 } })
  if (performersOut.length) parts.push({ performers: { value: performersOut, modifier: 'EXCLUDES' } })
  if (studiosOut.length) parts.push({ studios: { value: studiosOut, modifier: 'EXCLUDES', depth: -1 } })
  // last: it may hold an OR, and Stash allows no AND beside an OR
  const people = peopleAlternatives(ex.people, alternatives.length ? Math.max(1, Math.floor(MAX_OR / alternatives.length)) : MAX_BUCKETS)
  const either = alternatives.length && people.length ? alternatives.flatMap((a) => people.map((p) => ({ ...a, ...p }))) : alternatives.length ? alternatives : people
  const last = anyOf(either)
  if (last) parts.push(last)
  let node = filter
  for (const p of parts) {
    node.AND = p
    node = p
  }
  return filter
}

export function sceneFilter(q: SceneQuery, blocked: Exclusions): SceneFilterType {
  const f: SceneFilterType = {}
  const tags = ids(q.tags)
  const performers = ids(q.performers)
  const studios = ids(q.studios)
  if (tags.length) f.tags = { value: tags, modifier: 'INCLUDES_ALL', depth: 0 }
  if (performers.length) f.performers = { value: performers, modifier: 'INCLUDES_ALL' }
  if (studios.length) f.studios = { value: studios, modifier: 'INCLUDES', depth: -1 }
  if (q.minRating) f.rating100 = { value: q.minRating * 20 - 1, modifier: 'GREATER_THAN' }
  if (q.minHeight && minResolution[q.minHeight]) {
    f.resolution = { value: minResolution[q.minHeight], modifier: 'GREATER_THAN' }
  }
  if (q.minDuration && q.maxDuration) {
    f.duration = { value: q.minDuration * 60, value2: q.maxDuration * 60, modifier: 'BETWEEN' }
  } else if (q.minDuration) {
    f.duration = { value: q.minDuration * 60, modifier: 'GREATER_THAN' }
  } else if (q.maxDuration) {
    f.duration = { value: q.maxDuration * 60, modifier: 'LESS_THAN' }
  }
  if (q.unwatched) f.play_count = { value: 0, modifier: 'EQUALS' }
  if (q.inProgress) f.resume_time = { value: 0, modifier: 'GREATER_THAN' }
  if (q.favorites) f.performer_favorite = true

  // Cleanup filters. Each can repeat a field set above (e.g. a min and a max resolution).
  const extra: SceneFilterType[] = []
  if (q.maxHeight && minResolution[q.maxHeight]) {
    extra.push({ resolution: { value: minResolution[q.maxHeight], modifier: 'LESS_THAN' } })
  }
  if (q.maxRating) extra.push({ rating100: { value: q.maxRating * 20 + 1, modifier: 'LESS_THAN' } })
  if (q.unmatched) extra.push({ stash_id_count: { value: 0, modifier: 'EQUALS' } })
  if (q.transcodes) extra.push({ path: { value: NOT_MP4_PATH, modifier: 'NOT_MATCHES_REGEX' } })
  if (q.olderDays) {
    // day granularity keeps the filter, and so the query cache key, stable through the day
    const before = new Date(Date.now() - q.olderDays * 86_400_000).toISOString().slice(0, 10)
    extra.push({ created_at: { value: before, modifier: 'LESS_THAN' } })
  }
  if (q.duplicates) extra.push({ duplicated: { duplicated: true, phash: true, distance: 8 } })

  const ex: Exclusions = q.unblocked ? { tags: [], performers: [], studios: [], unlisted: blocked.unlisted, holdUnlisted: blocked.holdUnlisted } : { ...blocked }
  // Unlisted: the Vault asks for only those videos; `noUnlisted` (stations) holds them out; an
  // Unlisted id the query names is let in for this query, as a named blocked id is.
  const u = blocked.unlisted ?? { tags: [], performers: [], studios: [] }
  if (q.vault) ex.holdUnlisted = false
  else if (q.noUnlisted) ex.holdUnlisted = true
  if (ex.holdUnlisted)
    ex.unlisted = { tags: u.tags.filter((t) => !tags.includes(t)), performers: u.performers.filter((p) => !performers.includes(p)), studios: u.studios.filter((s) => !studios.includes(s)) }
  const vault: SceneFilterType[] = q.vault ? vaultAlternatives(u) : []
  // The list's own age or ethnicity filter replaces the Settings defaults; Show blocked drops them.
  if (blocked.people) {
    const own = q.minAge || q.maxAge || q.ethnicities
    const defaults: Partial<People> = q.unblocked || own ? {} : blocked.people
    ex.people = {
      gender: blocked.people.gender,
      firstYear: blocked.people.firstYear,
      minAge: own ? q.minAge : defaults.minAge,
      maxAge: own ? q.maxAge : defaults.maxAge,
      ethnicities: own ? q.ethnicities?.split(',').filter(Boolean) : defaults.ethnicities,
    }
  }
  // A blocked id the user explicitly asked to include wins for this query.
  ex.tags = [...new Set([...ex.tags, ...ids(q.xtags)])].filter((t) => !tags.includes(t))
  ex.performers = ex.performers.filter((p) => !performers.includes(p))
  ex.studios = ex.studios.filter((s) => !studios.includes(s))
  return withExclusions(f, ex, extra, vault)
}

// A scene in the Vault has an Unlisted category, performer or studio (sub-studios included).
// Nothing Unlisted: an impossible id, so the Vault is empty rather than the whole library.
function vaultAlternatives(u: UnlistedSets): SceneFilterType[] {
  const alt: SceneFilterType[] = []
  if (u.tags.length) alt.push({ tags: { value: u.tags, modifier: 'INCLUDES', depth: -1 } })
  if (u.performers.length) alt.push({ performers: { value: u.performers, modifier: 'INCLUDES' } })
  if (u.studios.length) alt.push({ studios: { value: u.studios, modifier: 'INCLUDES', depth: -1 } })
  return alt.length ? alt : [{ id: { value: 0, modifier: 'EQUALS' } }]
}

// Stash GenderEnum criterion for the Performers page's Women / Men / Everyone switch. Only that
// page reads it; `settings.performerGender` is still stored but read by nothing since
// 2026-10-31 (decisions/gender-switch-performers-page-only).
export function genderCriterion(g: PerformerGender): GenderCriterionInput | null {
  if (g === 'women') return { value_list: ['MALE'], modifier: 'EXCLUDES' }
  if (g === 'men') return { value: 'MALE', modifier: 'EQUALS' }
  return null
}

export function findFilter(q: {
  q?: string
  sort?: string
  dir?: 'asc' | 'desc'
  page?: number
  perPage?: number
  seed?: number
}): FindFilterType {
  const sort = q.sort === 'random' ? `random_${q.seed ?? 1}` : q.sort
  return {
    q: q.q || undefined,
    sort,
    direction: q.dir === 'asc' ? 'ASC' : 'DESC',
    page: q.page ?? 1,
    per_page: q.perPage ?? 40,
  }
}

// Does the blocklist (or "Not interested") exclude this scene? For results Stash cannot
// filter: what was watched, a station's resume points. Age and ethnicity defaults are not
// applied here; they shape what lists offer, not what you already watched.
// What the exclusion checks read of a scene. Opaque outside stash/: getScene hands it out as
// `marks` and unlisted.ts passes it back to unlistedReasons.
export type SceneMarks = Pick<Scene, 'tags' | 'performers' | 'studio'>

export function isBlocked(s: SceneMarks, ex: Pick<Exclusions, 'tags' | 'performers' | 'studios' | 'unlisted' | 'holdUnlisted'>): boolean {
  return (
    (s.tags ?? []).some((t) => ex.tags.includes(t.id)) ||
    (s.performers ?? []).some((p) => ex.performers.includes(p.id)) ||
    [s.studio?.id, s.studio?.parent_studio?.id].some((id) => id != null && ex.studios.includes(id)) ||
    (!!ex.holdUnlisted && !!ex.unlisted && unlistedReasons(s, ex.unlisted).size > 0)
  )
}

// Why a scene is Unlisted: `tag:<id>`, `performer:<id>`, `studio:<id>` (its studio or the parent).
// Empty: it is not. The related-videos rule compares these sets (wiki features/vault).
export function unlistedReasons(s: SceneMarks, u: UnlistedSets): Set<string> {
  const out = new Set<string>()
  for (const t of s.tags ?? []) if (u.tags.includes(t.id)) out.add(`tag:${t.id}`)
  for (const p of s.performers ?? []) if (u.performers.includes(p.id)) out.add(`performer:${p.id}`)
  for (const id of [s.studio?.id, s.studio?.parent_studio?.id]) if (id != null && u.studios.includes(id)) out.add(`studio:${id}`)
  return out
}

// May a scene with these reasons show beside (related to) one with `allowed`? Only if every reason
// it is Unlisted is also true of that one.
export const withinReasons = (reasons: Set<string>, allowed: Set<string>) => [...reasons].every((r) => allowed.has(r))
