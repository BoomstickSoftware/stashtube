import type { SceneQuery } from '@flix/shared'
import { useSyncExternalStore } from 'react'
import { idList, toggleId } from './query'

// The Browse filters, kept in this browser so they build up across pages: a "+" next to a
// performer, studio or tag anywhere adds it, and opening Browse brings the set back.
// Performers and tags must all match; studios are any-of (a scene has one studio).

export type FilterKind = 'performer' | 'studio' | 'tag'
const field = { performer: 'performers', studio: 'studios', tag: 'tags' } as const

const KEY = 'flix:browse-filters'
let current: SceneQuery = read()
const listeners = new Set<() => void>()

function read(): SceneQuery {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? (v as SceneQuery) : {}
  } catch {
    return {}
  }
}

export function setBrowseFilters(q: SceneQuery) {
  const clean = Object.fromEntries(Object.entries(q).filter(([k, v]) => v !== undefined && k !== 'page')) as SceneQuery
  if (JSON.stringify(clean) === JSON.stringify(current)) return
  current = clean
  try {
    localStorage.setItem(KEY, JSON.stringify(clean))
  } catch {}
  listeners.forEach((l) => l())
}

export const getBrowseFilters = () => current

export function useBrowseFilters(): SceneQuery {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

export const hasFilter = (q: SceneQuery, kind: FilterKind, id: string) => idList(q[field[kind]]).includes(id)

// Adds or removes one performer, studio or tag; returns whether it is now in the set.
export function toggleBrowseFilter(kind: FilterKind, id: string): boolean {
  const f = field[kind]
  const next = { ...current, [f]: toggleId(current[f], id) }
  // an included tag cannot also be excluded
  if (kind === 'tag' && hasFilter(next, 'tag', id)) next.xtags = idList(next.xtags).includes(id) ? toggleId(next.xtags, id) : next.xtags
  setBrowseFilters(next)
  return hasFilter(next, kind, id)
}

export const filterCount = (q: SceneQuery) => idList(q.performers).length + idList(q.studios).length + idList(q.tags).length

// The patch that adds one performer, studio or tag to a list's filters (an excluded tag
// becomes included).
export function addToQuery(query: SceneQuery, kind: FilterKind, id: string): Partial<SceneQuery> {
  if (hasFilter(query, kind, id)) return {}
  const f = field[kind]
  const patch: Partial<SceneQuery> = { [f]: [query[f], id].filter(Boolean).join(',') }
  if (kind === 'tag' && idList(query.xtags).includes(id)) patch.xtags = toggleId(query.xtags, id)
  return patch
}

// Every filter field (not sort or paging), so "clear all" and "apply" can replace them as a set.
export const FILTER_KEYS = [
  'q', 'tags', 'xtags', 'performers', 'studios', 'minRating', 'minHeight', 'minDuration', 'maxDuration',
  'unwatched', 'inProgress', 'favorites', 'unblocked', 'maxHeight', 'maxRating', 'unmatched', 'olderDays',
  'duplicates', 'minAge', 'maxAge', 'ethnicities',
] as const satisfies readonly (keyof SceneQuery)[]

export const clearAll: Partial<SceneQuery> = Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined]))
export const filtersOf = (q: SceneQuery): Partial<SceneQuery> => Object.fromEntries(FILTER_KEYS.map((k) => [k, q[k]]))

// How many filters are in play (the Filters button's count).
export const filterTotal = (q: SceneQuery) =>
  idList(q.performers).length + idList(q.studios).length + idList(q.tags).length + idList(q.xtags).length + idList(q.ethnicities).length +
  [q.q, q.unwatched, q.inProgress, q.favorites, q.minRating, q.minHeight, q.minDuration || q.maxDuration, q.minAge || q.maxAge,
    q.maxHeight, q.maxRating, q.unmatched, q.olderDays, q.duplicates, q.unblocked].filter(Boolean).length

