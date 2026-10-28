import type { SceneQuery } from '@flix/shared'
import { sceneSorts } from '@flix/shared'

// URL search params for any page that lists scenes. TanStack Router parses numbers
// and booleans already; this narrows and drops anything unknown.
export function parseSceneQuery(s: Record<string, unknown>): SceneQuery {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : undefined)
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const bool = (v: unknown) => (v === true || v === 1 || v === '1' || v === 'true' ? true : undefined)
  const ids = (v: unknown) => {
    const x = str(v)
    return x && /^[\d,]+$/.test(x) ? x : undefined
  }
  const sort = str(s.sort)
  return {
    q: str(s.q),
    sort: sort && sort in sceneSorts ? (sort as SceneQuery['sort']) : undefined,
    dir: s.dir === 'asc' ? 'asc' : undefined,
    seed: num(s.seed),
    tags: ids(s.tags),
    xtags: ids(s.xtags),
    performers: ids(s.performers),
    studios: ids(s.studios),
    minRating: num(s.minRating),
    minHeight: num(s.minHeight),
    minDuration: num(s.minDuration),
    maxDuration: num(s.maxDuration),
    unwatched: bool(s.unwatched),
    inProgress: bool(s.inProgress),
    favorites: bool(s.favorites),
    unblocked: bool(s.unblocked),
    maxHeight: num(s.maxHeight),
    maxRating: num(s.maxRating),
    unmatched: bool(s.unmatched),
    olderDays: num(s.olderDays),
    duplicates: bool(s.duplicates),
    minAge: num(s.minAge),
    maxAge: num(s.maxAge),
    ethnicities: typeof s.ethnicities === 'string' && /^[A-Za-z ,]+$/.test(s.ethnicities) ? s.ethnicities : undefined,
  }
}

export const idList = (csv?: string) => (csv ? csv.split(',').filter(Boolean) : [])
export const toCsv = (ids: string[]) => (ids.length ? ids.join(',') : undefined)

export function toggleId(csv: string | undefined, id: string): string | undefined {
  const ids = idList(csv)
  return toCsv(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
}

// A short label for an age range, e.g. "Age 18–25", "Age 40+".
export function ageLabel(min?: number, max?: number): string | null {
  if (!min && !max) return null
  return `Age ${min && max ? `${min}–${max}` : min ? `${min}+` : `up to ${max}`}`
}
