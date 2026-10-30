import type {
  DeleteResult,
  HistoryEntry,
  HomeRow,
  JobStatus,
  Page,
  SceneCard,
  SceneDetail,
  SceneFacets,
  SceneQuery,
  SearchResult,
  Stats,
} from '@flix/shared'
import { keepPreviousData, type QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, invalidateLists, qs, send } from './client'

// Videos: lists, one scene, search, and everything written about a scene (rating, O, plays,
// hiding, edits, markers, history, deletion).

// --- reads ----------------------------------------------------------------------

export function useScenes(q: SceneQuery, perPage = 40) {
  return useInfiniteQuery({
    queryKey: ['scenes', q, perPage],
    queryFn: ({ pageParam }) => get<Page<SceneCard>>(`/scenes${qs({ ...q, page: pageParam, perPage })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.perPage < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  })
}

// What a filter set holds: counts per tag, performer, studio and quick choice (the filter panel).
export const useFacets = (q: SceneQuery) => {
  const { sort: _s, seed: _d, dir: _r, page: _p, perPage: _n, ...filters } = q
  return useQuery({
    queryKey: ['scenes', 'facets', filters],
    queryFn: () => get<SceneFacets>(`/scenes/facets${qs(filters)}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

// How many videos a filter set matches (the filter dialog's "Show N videos").
export const useSceneCount = (q: SceneQuery) => {
  const { sort: _s, seed: _d, dir: _r, page: _p, perPage: _n, ...filters } = q
  return useQuery({
    queryKey: ['scenes', 'count', filters],
    queryFn: () => get<Page<SceneCard>>(`/scenes${qs({ ...filters, perPage: 1 })}`).then((p) => p.total),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

// Count of unfinished videos, for the Continue badge in the nav.
export const useContinueCount = () =>
  useQuery({
    queryKey: ['scenes', 'continue-count'],
    queryFn: () => get<Page<SceneCard>>(`/scenes${qs({ inProgress: true, perPage: 1 })}`).then((p) => p.total),
    staleTime: 60_000,
  })

export const useScene = (id: string) =>
  useQuery({ queryKey: ['scene', id], queryFn: () => get<SceneDetail>(`/scenes/${id}`) })

export const useRelated = (id: string) =>
  useQuery({ queryKey: ['related', id], queryFn: () => get<SceneCard[]>(`/scenes/${id}/related`), staleTime: 5 * 60_000 })

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ['search', q],
    queryFn: () => get<SearchResult>(`/search${qs({ q })}`),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
  })

// --- writes ---------------------------------------------------------------------

// Patch a scene everywhere it is cached: detail, lists, home rows, playlists.
function patchScene(qc: QueryClient, id: string, patch: Partial<SceneCard>) {
  const fix = (s: SceneCard) => (s.id === id ? { ...s, ...patch } : s)
  qc.setQueryData<SceneDetail>(['scene', id], (d) => d && { ...d, ...patch })
  // ['scenes', …] also holds the continue count, history and stats (so they refresh with
  // the lists); only the paged lists are patched.
  qc.setQueriesData<{ pages: Page<SceneCard>[] }>({ queryKey: ['scenes'] }, (d) =>
    d?.pages ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map(fix) })) } : d,
  )
  qc.setQueryData<HomeRow[]>(['home'], (d) => d?.map((r) => ({ ...r, items: r.items.map(fix) })))
}

export function useRateScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number | null }) => send('PUT', `/scenes/${id}/rating`, { rating }),
    onMutate: ({ id, rating }) => patchScene(qc, id, { rating }),
    onError: (_e, { id }) => qc.invalidateQueries({ queryKey: ['scene', id] }),
  })
}

export function useAddO() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => send<{ oCount: number }>('POST', `/scenes/${id}/o`),
    onSuccess: (r, id) => patchScene(qc, id, { oCount: r.oCount }),
  })
}

export const addPlay = (id: string) => send('POST', `/scenes/${id}/play`)
// "Mark as watched": one play, so Unwatched lists and the New badge let it go.
export function useMarkWatched() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => addPlay(id),
    onSuccess: (_r, id) => {
      patchScene(qc, id, { playCount: 1 })
      qc.invalidateQueries({ queryKey: ['scenes'] })
      qc.invalidateQueries({ queryKey: ['home'] })
    },
  })
}
export const saveActivity = (id: string, resumeTime: number, playDuration: number) =>
  send('POST', `/scenes/${id}/activity`, { resumeTime, playDuration })

// "Not interested": hides one video from every list; Settings lists them to undo.
export const useHiddenScenes = () => useQuery({ queryKey: ['hidden'], queryFn: () => get<SceneCard[]>('/scenes/hidden') })
export function useHideScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => send(hidden ? 'PUT' : 'DELETE', `/scenes/${id}/hidden`),
    onSuccess: (_r, { id }) => {
      invalidateLists(qc)
      qc.invalidateQueries({ queryKey: ['hidden'] })
      qc.invalidateQueries({ queryKey: ['scene', id] })
    },
  })
}

// --- history and stats -------------------------------------------------------------

export const useHistory = () => useQuery({ queryKey: ['scenes', 'history'], queryFn: () => get<HistoryEntry[]>('/history') })
export const useStats = () => useQuery({ queryKey: ['scenes', 'stats'], queryFn: () => get<Stats>('/stats') })

export function useRemoveFromHistory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => send('DELETE', `/history/${id}`),
    onMutate: (id) => qc.setQueryData<HistoryEntry[]>(['scenes', 'history'], (d) => d?.filter((e) => e.scene.id !== id)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['scenes'] })
      qc.invalidateQueries({ queryKey: ['home'] })
    },
  })
}

// --- scene edits, markers, identify ---------------------------------------------------

export function useSceneEdits(id: string) {
  const qc = useQueryClient()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['scene', id] })
    qc.invalidateQueries({ queryKey: ['scenes'] })
  }
  return {
    update: useMutation({
      mutationFn: (patch: { title?: string; tagIds?: string[] }) => send('PATCH', `/scenes/${id}`, patch),
      onSuccess: refresh,
    }),
    addMarker: useMutation({
      mutationFn: (b: { seconds: number; title: string }) => send('POST', `/scenes/${id}/markers`, b),
      onSuccess: refresh,
    }),
    renameMarker: useMutation({
      mutationFn: ({ marker, title }: { marker: string; title: string }) => send('PUT', `/scenes/${id}/markers/${marker}`, { title }),
      onSuccess: refresh,
    }),
    deleteMarker: useMutation({
      mutationFn: (marker: string) => send('DELETE', `/scenes/${id}/markers/${marker}`),
      onSuccess: refresh,
    }),
    identify: useMutation({ mutationFn: () => send<{ jobId: string }>('POST', `/scenes/${id}/identify`) }),
  }
}

export const useJob = (jobId: string | null) =>
  useQuery({
    queryKey: ['job', jobId],
    queryFn: () => get<JobStatus>(`/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && ['FINISHED', 'FAILED', 'CANCELLED'].includes(q.state.data.status) ? false : 1500),
  })

// --- deleting scenes (file, Whisparr entry, Stash scene) --------------------------------

// One scene per request: a delete can wait up to 30 s on a busy Stash, and each request must
// stay inside the timeout. It also lets the dialog show progress.
export function useDeleteScenes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, onProgress }: { ids: string[]; onProgress?: (done: number) => void }) => {
      const results: DeleteResult[] = []
      for (const id of ids) {
        results.push(...(await send<DeleteResult[]>('POST', '/scenes/delete', { sceneIds: [id] })))
        onProgress?.(results.length)
      }
      return results
    },
    // A deleted scene's own queries are only marked stale: refetching them now would 404 and turn
    // the open scene page into "not found" before the dialog can navigate away.
    onSuccess: (results) => {
      const gone = new Set(results.filter((r) => r.ok).map((r) => r.id))
      const own = (key: readonly unknown[]) => (key[0] === 'scene' || key[0] === 'related') && gone.has(String(key[1]))
      qc.invalidateQueries({ predicate: (q) => own(q.queryKey), refetchType: 'none' })
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'scene' && !own(q.queryKey) })
    },
  })
}
