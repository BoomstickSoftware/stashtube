import type {
  DeleteResult,
  Duplicates,
  HistoryEntry,
  HistoryPlays,
  HomeRow,
  JobStatus,
  Marker,
  Page,
  SceneCard,
  SceneDetail,
  SceneFacets,
  SceneQuery,
  SearchResult,
  Stats,
} from '@flix/shared'
import { type InfiniteData, keepPreviousData, type QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, invalidateLists, qs, queryClient, send } from './client'

// Videos: lists, one scene, search, and everything written about a scene (rating, O, plays,
// hiding, edits, markers, history, deletion).

// --- reads ----------------------------------------------------------------------

// Phash duplicate groups for the workbench; durationDiff -1 means any length difference.
export function useDuplicates(distance: number, durationDiff: number) {
  return useQuery({
    queryKey: ['duplicates', distance, durationDiff],
    queryFn: () => get<Duplicates>(`/duplicates${qs({ distance, durationDiff })}`),
    staleTime: 5 * 60_000,
  })
}

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

export const sceneQuery = (id: string) => ({ queryKey: ['scene', id], queryFn: () => get<SceneDetail>(`/scenes/${id}`) })
export const useScene = (id: string) => useQuery(sceneQuery(id))
// Fetched as soon as a card is touched or hovered (the route's loader on intent), so the page
// usually has it before the tap has finished.
export const prefetchScene = (id: string) => queryClient.prefetchQuery({ ...sceneQuery(id), staleTime: 30_000 })

// The card a list already holds for this scene (any list, Home rows included): what the page
// shows while the full record loads.
export function cachedCard(id: string): SceneCard | undefined {
  for (const [, d] of queryClient.getQueriesData<{ pages?: Page<SceneCard>[] } | HomeRow[] | SceneCard[]>({ predicate: (q) => ['scenes', 'home', 'related'].includes(q.queryKey[0] as string) })) {
    const cards = Array.isArray(d) ? d.flatMap((x) => ('items' in x ? x.items : [x])) : (d?.pages?.flatMap((p) => p.items) ?? [])
    const hit = cards.find((s) => s.id === id)
    if (hit) return hit
  }
  return undefined
}

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

// Patch a scene everywhere it is cached: detail, lists, home rows, playlists. The patch may be
// computed from the cached card (a count to bump).
export function patchScene(qc: QueryClient, id: string, patch: Partial<SceneCard> | ((s: SceneCard) => Partial<SceneCard>)) {
  const apply = <T extends SceneCard>(s: T): T => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })
  const fix = (s: SceneCard) => (s.id === id ? apply(s) : s)
  qc.setQueryData<SceneDetail>(['scene', id], (d) => d && apply(d))
  // ['scenes', …] also holds the continue count, history and stats (so they refresh with
  // the lists); only the paged lists are patched.
  qc.setQueriesData<{ pages: Page<SceneCard>[] }>({ queryKey: ['scenes'] }, (d) =>
    d?.pages ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map(fix) })) } : d,
  )
  qc.setQueriesData<HomeRow[]>({ queryKey: ['home'] }, (d) => d?.map((r) => ({ ...r, items: r.items.map(fix) })))
}

// The value a scene shows before an optimistic write, from whichever copy is cached, so a
// failed write can put it back everywhere (the global toast says why).
const cachedValue = <K extends keyof SceneCard>(qc: QueryClient, id: string, key: K): SceneCard[K] | undefined =>
  (qc.getQueryData<SceneDetail>(['scene', id]) ?? cachedCard(id))?.[key]

export function useRateScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number | null }) => send('PUT', `/scenes/${id}/rating`, { rating }),
    onMutate: ({ id, rating }) => {
      const prev = cachedValue(qc, id, 'rating')
      patchScene(qc, id, { rating })
      return { prev }
    },
    // back to the stars it had, in the lists too (until 2026-10-31 only the detail was refetched)
    onError: (_e, { id }, ctx) => {
      if (ctx?.prev !== undefined) patchScene(qc, id, { rating: ctx.prev })
      qc.invalidateQueries({ queryKey: ['scene', id] })
    },
  })
}

export function useAddO() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => send<{ oCount: number }>('POST', `/scenes/${id}/o`),
    onSuccess: (r, id) => patchScene(qc, id, { oCount: r.oCount }),
  })
}

// A play and a progress save patch the cached cards as soon as Stash has them (view count,
// New badge, progress bar), so the list you go Back to shows what you just watched instead of
// waiting a refetch (the server serves the expired list once more, caching.md). Both are called
// by the players' watch accounting, which already checks the private session.
export const addPlay = (id: string) =>
  send('POST', `/scenes/${id}/play`).then(() => patchScene(queryClient, id, (s) => ({ playCount: s.playCount + 1, lastPlayedAt: new Date().toISOString() })))
// "Mark as watched": one play, so Unwatched lists and the New badge let it go, and the resume
// point cleared, so it leaves Continue (decisions/continue-clears-and-expires).
export function useMarkWatched() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      send('POST', `/scenes/${id}/watched`).then(() => {
        patchScene(queryClient, id, (s) => ({ playCount: s.playCount + 1, lastPlayedAt: new Date().toISOString() }))
        noteResume(id, 0)
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scenes'] })
      qc.invalidateQueries({ queryKey: ['home'] })
    },
  })
}
export const saveActivity = (id: string, resumeTime: number, playDuration: number) =>
  send('POST', `/scenes/${id}/activity`, { resumeTime, playDuration }).then(() => noteResume(id, resumeTime))

// Remove videos from Continue: their resume points go to 0; plays and History stay.
export function useClearContinue() {
  return useMutation({
    mutationFn: (ids: string[]) => send('POST', '/continue/clear', { ids }).then(() => ids.forEach((id) => noteResume(id, 0))),
  })
}

// The Continue badge in the nav and the Continue list change only when a resume point appears
// or goes (not as it moves); the count is nudged at once and confirmed by a refetch.
const inProgressList = (q: { queryKey: readonly unknown[] }) =>
  q.queryKey[0] === 'scenes' && typeof q.queryKey[1] === 'object' && !!(q.queryKey[1] as SceneQuery | null)?.inProgress
function noteResume(id: string, resumeTime: number) {
  const qc = queryClient
  const was = (cachedValue(qc, id, 'resumeTime') ?? 0) > 0
  patchScene(qc, id, { resumeTime })
  const is = resumeTime > 0
  if (was === is) return
  qc.setQueryData<number>(['scenes', 'continue-count'], (n) => (n === undefined ? n : Math.max(0, n + (is ? 1 : -1))))
  qc.invalidateQueries({ queryKey: ['scenes', 'continue-count'] })
  qc.invalidateQueries({ predicate: inProgressList })
}

// Videos still tagged "Not interested" from before it meant delete (2026-11-09): Cleanup lists
// them to delete or keep; Keep takes the tag off.
export const useHiddenScenes = () => useQuery({ queryKey: ['hidden'], queryFn: () => get<SceneCard[]>('/scenes/hidden') })
export function useKeepScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => send('DELETE', `/scenes/${id}/hidden`),
    onSuccess: (_r, { id }) => {
      invalidateLists(qc)
      qc.invalidateQueries({ queryKey: ['hidden'] })
      qc.invalidateQueries({ queryKey: ['scene', id] })
    },
  })
}

// --- history and stats -------------------------------------------------------------

// One entry per video per day in this browser's time zone, newest first, 40 a page.
export const historyKey = (e: HistoryEntry) => `${e.scene.id}|${e.day}`
export const useHistory = () =>
  useInfiniteQuery({
    queryKey: ['scenes', 'history'],
    queryFn: ({ pageParam }) => get<Page<HistoryEntry>>(`/history${qs({ page: pageParam, perPage: 40, tz: new Date().getTimezoneOffset() })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.perPage < last.total ? last.page + 1 : undefined),
  })
export const useStats = () => useQuery({ queryKey: ['scenes', 'stats'], queryFn: () => get<Stats>('/stats') })

// Remove takes exactly those plays out of Stash (the play count follows; the resume point stays);
// restore is its Undo and puts the same times back. Removed entries leave the list at once.
function useHistoryWrite(path: 'remove' | 'restore') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entries: HistoryEntry[]) => send('POST', `/history/${path}`, { plays: entries.map((e) => ({ id: e.scene.id, times: e.times })) } satisfies HistoryPlays),
    onMutate: (entries) => {
      if (path !== 'remove') return
      const gone = new Set(entries.map(historyKey))
      qc.setQueryData<InfiniteData<Page<HistoryEntry>>>(['scenes', 'history'], (d) =>
        d && { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.filter((e) => !gone.has(historyKey(e))) })) },
      )
    },
    onSettled: (_r, _e, entries) => {
      qc.invalidateQueries({ queryKey: ['scenes'] })
      qc.invalidateQueries({ queryKey: ['home'] })
      for (const id of new Set(entries.map((e) => e.scene.id))) qc.invalidateQueries({ queryKey: ['scene', id] }) // its play count
    },
  })
}
export const useRemoveFromHistory = () => useHistoryWrite('remove')
export const useRestoreHistory = () => useHistoryWrite('restore')

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
      onSuccess: () => {
        refresh()
        // the title and tags also sit on Home's cards (persisted) and in related rows
        qc.invalidateQueries({ queryKey: ['home'] })
        qc.invalidateQueries({ queryKey: ['related'] })
      },
    }),
    addMarker: useMutation({
      mutationFn: (b: { seconds: number; title: string; tagId?: string }) => send<Marker>('POST', `/scenes/${id}/markers`, b),
      onSuccess: refresh,
    }),
    updateMarker: useMutation({
      mutationFn: ({ marker, ...patch }: { marker: string; title?: string; tagId?: string }) => send<Marker>('PUT', `/scenes/${id}/markers/${marker}`, patch),
      onSuccess: refresh,
    }),
    deleteMarker: useMutation({
      mutationFn: (marker: string) => send('DELETE', `/scenes/${id}/markers/${marker}`),
      onSuccess: refresh,
    }),
    // The server waits for Stash's Identify job (up to 40 s) and answers with its result; a job
    // still running then is remembered here, so the page keeps polling it (useJob) when it comes
    // back. This onSuccess runs even after the page has unmounted (hook-level callbacks do).
    identify: useMutation({
      mutationFn: () => send<JobStatus>('POST', `/scenes/${id}/identify`),
      onSuccess: (job) => {
        if (jobDone(job)) identifyFinished(qc, id)
        else pendingIdentify.set(id, job.id)
      },
    }),
  }
}

export const jobDone = (job: JobStatus | undefined) => !!job && ['FINISHED', 'FAILED', 'CANCELLED'].includes(job.status)
// Identify jobs that outlived their request, scene id → job id, until seen finished.
export const pendingIdentify = new Map<string, string>()
// What an Identify can have changed: the scene's title, date, studio, performers, tags and cover,
// so every copy of its card.
export function identifyFinished(qc: QueryClient, id: string) {
  pendingIdentify.delete(id)
  qc.invalidateQueries({ queryKey: ['scene', id] })
  qc.invalidateQueries({ queryKey: ['scenes'] })
  qc.invalidateQueries({ queryKey: ['home'] })
  qc.invalidateQueries({ queryKey: ['related'] })
}

export const useJob = (jobId: string | null) =>
  useQuery({
    queryKey: ['job', jobId],
    queryFn: () => get<JobStatus>(`/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) => (jobDone(q.state.data) ? false : 1500),
  })

// --- deleting scenes (file, Whisparr entry, Stash scene) --------------------------------

// One scene per request: a delete can wait up to 30 s on a busy Stash, and each request must
// stay inside the timeout. It also lets the dialog show progress.
export function useDeleteScenes() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true }, // the dialog shows the error itself
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
