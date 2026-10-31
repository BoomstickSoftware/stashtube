// A list's filters as words, once, for everything that shows them: the removable chips, a
// station's one-line summary and a pinned row's default title.
import type { PerformerDetail, SceneQuery, StudioDetail } from '@flix/shared'
import { sceneSorts } from '@flix/shared'
import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { get, useTags } from './api'
import { ageLabel, idList, toggleId } from './query'

export type Patch = Partial<SceneQuery>

export interface QueryPart {
  key: string
  label: string
  tone: 'include' | 'exclude' | 'plain'
  clear: Patch // the patch that removes just this part
}

export interface Names {
  performer: (id: string) => string | undefined
  studio: (id: string) => string | undefined
  tag: (id: string) => string | undefined
}

export const lengths = [
  { key: 'short', label: 'Under 15 min', min: undefined, max: 15 },
  { key: 'mid', label: '15–40 min', min: 15, max: 40 },
  { key: 'long', label: '40+ min', min: 40, max: undefined },
]

const csv = (v?: string) => (v ? v.split(',').filter(Boolean) : [])
const height = (h: number) => (h >= 2160 ? '4K' : `${h}p`)

export function describeQuery(q: SceneQuery, names: Names): QueryPart[] {
  const out: QueryPart[] = []
  const plain = (key: string, label: string, clear: Patch) => out.push({ key, label, tone: 'plain', clear })
  if (q.q) out.push({ key: 'q', label: `Title has “${q.q}”`, tone: 'include', clear: { q: undefined } })
  for (const id of idList(q.performers))
    out.push({ key: `p${id}`, label: names.performer(id) ?? '…', tone: 'include', clear: { performers: toggleId(q.performers, id) } })
  for (const id of idList(q.studios)) out.push({ key: `s${id}`, label: names.studio(id) ?? '…', tone: 'include', clear: { studios: toggleId(q.studios, id) } })
  for (const id of idList(q.tags)) out.push({ key: `t${id}`, label: names.tag(id) ?? '…', tone: 'include', clear: { tags: toggleId(q.tags, id) } })
  for (const id of idList(q.xtags)) out.push({ key: `x${id}`, label: names.tag(id) ?? '…', tone: 'exclude', clear: { xtags: toggleId(q.xtags, id) } })
  if (q.unwatched) plain('unwatched', 'Unwatched', { unwatched: undefined })
  if (q.inProgress) plain('inProgress', 'In progress', { inProgress: undefined })
  if (q.favorites) plain('favorites', 'Performers I follow', { favorites: undefined })
  if (q.minRating) plain('minRating', `★ ${q.minRating}+`, { minRating: undefined })
  if (q.minHeight) plain('minHeight', q.minHeight >= 2160 ? '4K' : `${q.minHeight}p+`, { minHeight: undefined })
  if (q.minDuration || q.maxDuration)
    plain(
      'len',
      lengths.find((l) => l.min === q.minDuration && l.max === q.maxDuration)?.label ?? `${q.minDuration ?? 0}–${q.maxDuration ?? '∞'} min`,
      { minDuration: undefined, maxDuration: undefined },
    )
  const age = ageLabel(q.minAge, q.maxAge)
  if (age) plain('age', age, { minAge: undefined, maxAge: undefined })
  for (const e of csv(q.ethnicities)) {
    const rest = csv(q.ethnicities).filter((x) => x !== e)
    plain(`e${e}`, e, { ethnicities: rest.length ? rest.join(',') : undefined })
  }
  // set by the cleanup page; shown so they can be removed
  if (q.maxHeight) plain('maxHeight', `Below ${height(q.maxHeight)}`, { maxHeight: undefined })
  if (q.maxRating) plain('maxRating', `Rated ★${q.maxRating} or less`, { maxRating: undefined })
  if (q.unmatched) plain('unmatched', 'Not on StashDB', { unmatched: undefined })
  if (q.olderDays) plain('olderDays', `Added ${q.olderDays}+ days ago`, { olderDays: undefined })
  if (q.duplicates) plain('duplicates', 'Possible duplicates', { duplicates: undefined })
  if (q.unblocked) plain('unblocked', 'Showing blocked', { unblocked: undefined })
  return out
}

// One line: "Riley Reyes · Gangbang · no Anal · 1080p+ · Unwatched".
export const summarize = (parts: QueryPart[]) => parts.map((p) => (p.tone === 'exclude' ? `no ${p.label}` : p.label)).join(' · ')

// A pinned row's default title: the summary, else the sort, else a placeholder; kept short.
export function rowTitle(q: SceneQuery, parts: QueryPart[]): string {
  const sort = q.sort && q.sort !== 'date' ? sceneSorts[q.sort] : null
  const title = summarize(parts) || sort || 'My row'
  return title.length > 80 ? `${title.slice(0, 77)}…` : title
}

// The parts with their names filled in from the API (names arrive as "…" first, then resolve).
export function useQueryParts(q: SceneQuery): QueryPart[] {
  const { data: tags } = useTags({ sort: 'name' })
  const performers = useQueries({
    queries: idList(q.performers).map((id) => ({ queryKey: ['performer', id], queryFn: () => get<PerformerDetail>(`/performers/${id}`), staleTime: 300_000 })),
  })
  const studios = useQueries({
    queries: idList(q.studios).map((id) => ({ queryKey: ['studio', id], queryFn: () => get<StudioDetail>(`/studios/${id}`), staleTime: 300_000 })),
  })
  const pNames = performers.map((r) => r.data?.name).join('\0')
  const sNames = studios.map((r) => r.data?.name).join('\0')
  return useMemo(() => {
    const byId = (list: { data?: { id: string; name: string } }[]) => new Map(list.map((r) => [r.data?.id, r.data?.name]))
    const p = byId(performers)
    const s = byId(studios)
    const t = new Map(tags?.items.map((x) => [x.id, x.name]))
    return describeQuery(q, { performer: (id) => p.get(id), studio: (id) => s.get(id), tag: (id) => t.get(id) })
    // the query results are new arrays every render; what matters is the names in them
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tags, pNames, sNames])
}
