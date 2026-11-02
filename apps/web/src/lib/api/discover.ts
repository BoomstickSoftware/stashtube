import type { DiscoverEntity, DiscoverPage, DiscoverSort, WaitingScene } from '@flix/shared'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, qs, send } from './client'
import { useFeatures } from './settings'

// Discover: StashDB browsed through the server's mirror (architecture/stashdb-mirror), the paced
// Get queue a selection joins, and the fetched scenes still waiting for a release. The server
// rate-limits and caches every StashDB call; nothing here talks to StashDB.

export interface DiscoverFilters {
  q?: string
  performers?: string[]
  studios?: string[]
  tags?: string[]
  sort?: DiscoverSort
}

export function useStashDbOn() {
  const { data } = useFeatures()
  return !!data?.stashdb
}

const listParam = (ids?: string[]) => (ids?.length ? ids.join(',') : undefined)

export function useDiscover(f: DiscoverFilters) {
  const on = useStashDbOn()
  const params = { q: f.q || undefined, performers: listParam(f.performers), studios: listParam(f.studios), tags: listParam(f.tags), sort: f.sort }
  return useInfiniteQuery({
    queryKey: ['discover', params],
    queryFn: ({ pageParam }) => get<DiscoverPage>(`/discover${qs({ ...params, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore && last.page < 200 ? last.page + 1 : undefined),
    enabled: on,
    staleTime: 5 * 60_000,
  })
}

// Names for the filter picker; the server caches each search for a day.
export function useDiscoverNames(kind: DiscoverEntity['kind'], term: string) {
  const on = useStashDbOn()
  const t = term.trim()
  return useQuery({
    queryKey: ['discover-names', kind, t.toLowerCase()],
    queryFn: () => get<DiscoverEntity[]>(`/discover/names${qs({ kind, q: t })}`),
    enabled: on && t.length >= 2,
    staleTime: 60 * 60_000,
  })
}

// A library performer's or studio's StashDB ids, for "Browse on StashDB".
export function useStashDbIds(kind: 'performer' | 'studio', id: string) {
  const on = useStashDbOn()
  return useQuery({ queryKey: ['stashdb-ids', kind, id], queryFn: () => get<{ ids: string[] }>(`/discover/from/${kind}/${id}`), enabled: on, staleTime: Infinity })
}

// Queue a selection; the server fetches one scene every few seconds.
export function useGetMany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stashdbIds: string[]) => send<{ queued: number }>('POST', '/whisparr/get-many', { stashdbIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waiting'] })
      setTimeout(() => qc.invalidateQueries({ queryKey: ['discover'] }), 1000)
    },
  })
}

export function useWaiting(enabled = true) {
  const { data } = useFeatures()
  return useQuery({
    queryKey: ['waiting'],
    queryFn: () => get<WaitingScene[]>('/whisparr/waiting'),
    enabled: enabled && !!data?.whisparr,
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.some((w) => w.scene.state === 'queued') ? 10_000 : false),
  })
}

function useWaitingWrite<T>(fn: (arg: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['waiting'] }) })
}
export const useSearchAgain = () => useWaitingWrite((movieId: number) => send('POST', `/whisparr/waiting/${movieId}/search`))
export const useGiveUp = () => useWaitingWrite((movieId: number) => send('DELETE', `/whisparr/waiting/${movieId}`))
export const useCancelQueued = () => useWaitingWrite((stashdbId: string) => send('DELETE', `/whisparr/queue/${stashdbId}`))
export const useRunDiscovery = () => useWaitingWrite(() => send<{ queued: number }>('POST', '/discover/run'))
