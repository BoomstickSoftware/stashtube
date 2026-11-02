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
import { keepPreviousData, type QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, invalidateLists, qs, send } from './client'
import { refreshWatchSoon } from './whisparr'

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

// Every write below shows its new value at once and, when Stash refuses it, puts the old one
// back in the same places (the failed-write toast in client.ts says why). `onMutate` returns
// the previous value as the mutation context for `onError`.

// Patch a performer in its detail and in every performer grid page.
function patchPerformer(qc: QueryClient, id: string, patch: Partial<PerformerCard>) {
  qc.setQueryData<PerformerDetail>(['performer', id], (d) => d && { ...d, ...patch })
  qc.setQueriesData<{ pages: Page<PerformerCard>[] }>({ queryKey: ['performers'] }, (d) =>
    d?.pages ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) })) } : d,
  )
}
const cachedPerformer = (qc: QueryClient, id: string): PerformerCard | undefined =>
  qc.getQueryData<PerformerDetail>(['performer', id]) ??
  qc.getQueriesData<{ pages: Page<PerformerCard>[] }>({ queryKey: ['performers'] }).flatMap(([, d]) => d?.pages?.flatMap((p) => p.items) ?? []).find((x) => x.id === id)

export function useFavoritePerformer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => send('PUT', `/performers/${id}/favorite`, { favorite }),
    onMutate: ({ id, favorite }) => {
      const prev = cachedPerformer(qc, id)?.favorite ?? !favorite
      patchPerformer(qc, id, { favorite }) // the heart flips in the grids too, without a refetch
      return { prev }
    },
    onError: (_e, { id }, ctx) => ctx && patchPerformer(qc, id, { favorite: ctx.prev }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['home'] })
      refreshWatchSoon(qc) // Whisparr follows the follow a few seconds later (server sync.ts)
    },
  })
}

export function useRatePerformer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number | null }) => send('PUT', `/performers/${id}/rating`, { rating }),
    onMutate: ({ id, rating }) => {
      const prev = cachedPerformer(qc, id)?.rating
      patchPerformer(qc, id, { rating })
      return { prev }
    },
    onError: (_e, { id }, ctx) => ctx?.prev !== undefined && patchPerformer(qc, id, { rating: ctx.prev }),
  })
}

export function useFavoriteStudio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => send('PUT', `/studios/${id}/favorite`, { favorite }),
    onMutate: ({ id, favorite }) => {
      const prev = qc.getQueryData<StudioDetail>(['studio', id])?.favorite ?? !favorite
      qc.setQueryData<StudioDetail>(['studio', id], (d) => d && { ...d, favorite })
      return { prev }
    },
    onError: (_e, { id }, ctx) => ctx && qc.setQueryData<StudioDetail>(['studio', id], (d) => d && { ...d, favorite: ctx.prev }),
  })
}

// Pins a category (Stash's tag favourite): the tile and the category page.
function patchTag(qc: QueryClient, id: string, favorite: boolean) {
  qc.setQueryData<TagTile[]>(['tags', 'tiles'], (d) => d?.map((t) => (t.id === id ? { ...t, favorite } : t)))
  qc.setQueryData<TagDetail>(['tag', id], (d) => d && { ...d, favorite })
}
export function useFavoriteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => send('PUT', `/tags/${id}/favorite`, { favorite }),
    onMutate: ({ id, favorite }) => {
      const prev = (qc.getQueryData<TagDetail>(['tag', id]) ?? qc.getQueryData<TagTile[]>(['tags', 'tiles'])?.find((t) => t.id === id))?.favorite ?? !favorite
      patchTag(qc, id, favorite)
      return { prev }
    },
    onError: (_e, { id }, ctx) => ctx && patchTag(qc, id, ctx.prev),
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
    onSuccess: () => {
      invalidateLists(qc)
      refreshWatchSoon(qc) // a blocked performer or studio is unmonitored in Whisparr shortly after
    },
  })
}
