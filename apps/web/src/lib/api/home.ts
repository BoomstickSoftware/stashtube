import type { FeaturedWeights, HomeRow, SavedRow, SceneCard, SceneQuery } from '@flix/shared'
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { readStored, writeStored } from '../storage'
import { get, HOME_SEED_KEY, queryClient, send } from './client'

// The Home page: its rows, the Featured dials' live preview, and the pinned rows.

// The Featured row and hero keep their order while `seed` stays. A seed lasts SEED_MINUTES, so
// Featured changes often by itself (a new seed brings a nearly new row: 0–3 of 24 shared,
// 2026-11-07); Shuffle rolls it now. Stepping away from Home and coming back within
// SEED_MINUTES keeps it, up to KEEP_MINUTES in all, so a Back to Home finds its feed cached and
// scrolled where it was. (_1 hour flat until 2026-11-09, 6 until 2026-11-07; the user wants new
// content surfacing more often._)
const SEED_MINUTES = 5
const KEEP_MINUTES = 60
type StoredSeed = { seed?: unknown; at?: unknown; seen?: unknown }
const readSeed = () => readStored(HOME_SEED_KEY, (v) => v as StoredSeed | undefined)
const rollSeed = () => {
  const seed = Math.random().toString(36).slice(2, 10)
  writeStored(HOME_SEED_KEY, { seed, at: Date.now() })
  return seed
}
export const homeSeed = (): string => {
  const s = readSeed()
  const now = Date.now()
  const min = 60_000
  if (typeof s?.seed !== 'string' || typeof s.at !== 'number') return rollSeed()
  const young = now - s.at < SEED_MINUTES * min
  const justAway = typeof s.seen === 'number' && now - s.seen < SEED_MINUTES * min && now - s.at < KEEP_MINUTES * min
  return young || justAway ? s.seed : rollSeed()
}
// Home was on screen until now (it is leaving, or the app is going to the background).
export const markHomeSeen = () => {
  const s = readSeed()
  if (typeof s?.seed === 'string') writeStored(HOME_SEED_KEY, { ...s, seen: Date.now() })
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
