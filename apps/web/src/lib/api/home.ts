import type { FeaturedWeights, HomeRow, SavedRow, SceneCard, SceneQuery } from '@flix/shared'
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { readStored, writeStored } from '../storage'
import { get, HOME_SEED_KEY, queryClient, send } from './client'

// The Home page: its rows, the Featured dials' live preview, and the pinned rows.

// The Featured row and hero keep their order while `seed` stays. It is kept (per browser)
// across visits for SEED_HOURS, so a return to Home or a cold open finds its feed in the
// cache and paints at once, scrolled where it was; then it rolls, and Shuffle rolls it now.
const SEED_HOURS = 6
const rollSeed = () => {
  const seed = Math.random().toString(36).slice(2, 10)
  writeStored(HOME_SEED_KEY, { seed, at: Date.now() })
  return seed
}
export const homeSeed = (): string => {
  const s = readStored(HOME_SEED_KEY, (v) => v as { seed?: unknown; at?: unknown } | undefined)
  const fresh = typeof s?.seed === 'string' && typeof s.at === 'number' && Date.now() - s.at < SEED_HOURS * 3_600_000
  return fresh ? (s.seed as string) : rollSeed()
}
export const shuffleSeed = rollSeed

// Until a new seed's feed arrives, the newest feed in the cache stands in (a rolled seed).
const lastFeed = () =>
  queryClient
    .getQueryCache()
    .findAll({ queryKey: ['home'], type: 'all' })
    .filter((q) => q.state.data)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0]?.state.data as HomeRow[] | undefined

export const useHome = (seed: string) =>
  useQuery({ queryKey: ['home', seed], queryFn: () => get<HomeRow[]>(`/home?seed=${seed}`), placeholderData: (prev) => keepPreviousData(prev) ?? lastFeed() })

// The hero past the Featured row: the same ranking, further down, HERO_PAGE at a time,
// asked for as the hero nears its end (Home's Hero). `from` is the row's length.
export const HERO_PAGE = 20
export const useMoreFeatured = (seed: string, from: number, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: ['featured-more', seed, from],
    initialPageParam: from,
    queryFn: ({ pageParam }) => get<SceneCard[]>(`/featured?seed=${seed}&limit=${HERO_PAGE}&offset=${pageParam}`),
    getNextPageParam: (last, _all, lastOffset) => (last.length < HERO_PAGE ? undefined : lastOffset + HERO_PAGE),
    enabled,
    staleTime: 30 * 60_000,
  })

// Settings' live preview of the Featured dials, unsaved.
export const useFeaturedPreview = (weights: FeaturedWeights, enabled: boolean) =>
  useQuery({
    queryKey: ['featured-preview', weights],
    queryFn: () => send<SceneCard[]>('POST', '/featured/preview', { weights, seed: 'preview', limit: 12 }),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    enabled,
  })

// --- pinned rows ------------------------------------------------------------------

export function useRowMutations() {
  const qc = useQueryClient()
  const done = () => {
    qc.invalidateQueries({ queryKey: ['home'] })
    qc.invalidateQueries({ queryKey: ['rows'] })
  }
  return {
    pin: useMutation({ mutationFn: (b: { title: string; query: SceneQuery }) => send<{ id: number }>('POST', '/rows', b), onSuccess: done }),
    rename: useMutation({ mutationFn: ({ id, title }: { id: number; title: string }) => send('PUT', `/rows/${id}`, { title }), onSuccess: done }),
    unpin: useMutation({ mutationFn: (id: number) => send('DELETE', `/rows/${id}`), onSuccess: done }),
    reorder: useMutation({ mutationFn: (ids: number[]) => send('PUT', '/rows/order', { ids }), onSuccess: done }),
  }
}

export const useRows = () => useQuery({ queryKey: ['rows'], queryFn: () => get<SavedRow[]>('/rows') })
