import type {
  BlockKind,
  Blocklist,
  Page,
  PerformerCard,
  PerformerDetail,
  PerformerGender,
  Settings,
  StudioCard,
  StudioDetail,
  TagCard,
  TagDetail,
  TagTile,
} from '@flix/shared'
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, invalidateLists, qs, send } from './client'

// Performers, studios and tags: lists, one of each, their favourite/rating writes, the
// blocklist, and the per-studio intro skip.

export function usePerformers(params: { q?: string; sort?: string; favorites?: boolean; seed?: number; gender?: PerformerGender }) {
  return useInfiniteQuery({
    queryKey: ['performers', params],
    queryFn: ({ pageParam }) => get<Page<PerformerCard>>(`/performers${qs({ ...params, page: pageParam, perPage: 60 })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.perPage < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  })
}

export const usePerformer = (id: string) =>
  useQuery({ queryKey: ['performer', id], queryFn: () => get<PerformerDetail>(`/performers/${id}`) })

export const useStudios = (params: { q?: string; sort?: string }) =>
  useQuery({
    queryKey: ['studios', params],
    queryFn: () => get<Page<StudioCard>>(`/studios${qs({ ...params, perPage: 200 })}`),
    placeholderData: keepPreviousData,
  })

export const useStudio = (id: string) =>
  useQuery({ queryKey: ['studio', id], queryFn: () => get<StudioDetail>(`/studios/${id}`) })

export const useTags = (params: { q?: string; sort?: string; unblocked?: boolean }, enabled = true) =>
  useQuery({
    queryKey: ['tags', params],
    queryFn: () => get<Page<TagCard>>(`/tags${qs({ ...params, perPage: params.q ? 30 : 1000 })}`),
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 5 * 60_000,
  })

export const useTag = (id: string) => useQuery({ queryKey: ['tag', id], queryFn: () => get<TagDetail>(`/tags/${id}`) })

export const useTagTiles = () =>
  useQuery({ queryKey: ['tags', 'tiles'], queryFn: () => get<TagTile[]>('/tags/tiles'), staleTime: 5 * 60_000 })

// --- writes ---------------------------------------------------------------------

export function useFavoritePerformer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => send('PUT', `/performers/${id}/favorite`, { favorite }),
    onMutate: ({ id, favorite }) => {
      qc.setQueryData<PerformerDetail>(['performer', id], (d) => d && { ...d, favorite })
      // flip the heart in performer grids at once, without a refetch
      qc.setQueriesData<{ pages: Page<PerformerCard>[] }>({ queryKey: ['performers'] }, (d) =>
        d?.pages ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === id ? { ...x, favorite } : x)) })) } : d,
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['home'] }),
  })
}

export function useRatePerformer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number | null }) => send('PUT', `/performers/${id}/rating`, { rating }),
    onMutate: ({ id, rating }) => qc.setQueryData<PerformerDetail>(['performer', id], (d) => d && { ...d, rating }),
  })
}

export function useFavoriteStudio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => send('PUT', `/studios/${id}/favorite`, { favorite }),
    onMutate: ({ id, favorite }) => qc.setQueryData<StudioDetail>(['studio', id], (d) => d && { ...d, favorite }),
  })
}

// Pins a category (Stash's tag favourite).
export function useFavoriteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => send('PUT', `/tags/${id}/favorite`, { favorite }),
    onMutate: ({ id, favorite }) => {
      qc.setQueryData<TagTile[]>(['tags', 'tiles'], (d) => d?.map((t) => (t.id === id ? { ...t, favorite } : t)))
      qc.setQueryData<TagDetail>(['tag', id], (d) => d && { ...d, favorite })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tags', 'tiles'] }),
  })
}

// Per-studio intro skip, stored in Settings.
export function useIntroSkip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ studioId, seconds }: { studioId: string; seconds: number | null }) =>
      send<Settings>('PUT', `/studios/${studioId}/intro`, { seconds }),
    onSuccess: (s) => qc.setQueryData(['settings'], s),
  })
}

// --- blocklist --------------------------------------------------------------------

export const useBlocklist = () => useQuery({ queryKey: ['blocklist'], queryFn: () => get<Blocklist>('/blocklist') })
export function useIsBlocked(kind: BlockKind, id: string) {
  const { data } = useBlocklist()
  const list = kind === 'tag' ? data?.tags : kind === 'performer' ? data?.performers : data?.studios
  return !!list?.some((x) => x.id === id)
}

export function useBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, id, blocked }: { kind: BlockKind; id: string; blocked: boolean }) =>
      send(blocked ? 'PUT' : 'DELETE', `/blocklist/${kind}/${id}`),
    onSuccess: () => invalidateLists(qc),
  })
}
