import type {
  BlockKind,
  CacheScope,
  CacheStats,
  Blocklist,
  DeleteResult,
  Features,
  HistoryEntry,
  HomeRow,
  JobStatus,
  Page,
  PerformerCard,
  PerformerDetail,
  PerformerGender,
  Playlist,
  PlaylistDetail,
  SceneCard,
  SceneDetail,
  SceneQuery,
  SavedRow,
  SearchResult,
  Settings,
  Stats,
  StudioCard,
  StudioDetail,
  TagCard,
  TagDetail,
  TagTile, SavedStation, StationInput, StationResume, SceneFacets } from '@flix/shared'
import {
  keepPreviousData,
  type Query,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useState } from 'react'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const TIMEOUT = 45_000 // ms; a request that never answers is retried instead of spinning forever

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (res.status === 401 && !path.startsWith('/auth')) {
    window.dispatchEvent(new Event('flix:login-required'))
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, err?.error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const get = <T>(path: string) => request<T>('GET', path)
const send = <T = void>(method: string, path: string, body?: unknown) => request<T>(method, path, body)

export function qs(params: object): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    p.set(k, v === true ? '1' : String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
      refetchOnWindowFocus: false,
    },
  },
})

// Queries kept in localStorage between visits (see main.tsx): small, and what the first
// screen needs. They must outlive the default 5-minute gcTime, or leaving the page for a
// while would drop them from storage too.
const PERSISTED = ['session', 'home', 'settings', 'favorite-scenes', 'playlists', 'blocklist']
export const PERSIST_MAX_AGE = 7 * 24 * 3_600_000
for (const key of PERSISTED) queryClient.setQueryDefaults([key], { gcTime: PERSIST_MAX_AGE })
export const persistQuery = (q: Query) => q.state.status === 'success' && PERSISTED.includes(q.queryKey[0] as string)

// --- reads ----------------------------------------------------------------------

export const useHome = () => useQuery({ queryKey: ['home'], queryFn: () => get<HomeRow[]>('/home') })

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

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ['search', q],
    queryFn: () => get<SearchResult>(`/search${qs({ q })}`),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
  })

export const usePlaylists = () => useQuery({ queryKey: ['playlists'], queryFn: () => get<Playlist[]>('/playlists') })

export const usePlaylist = (id: number | undefined) =>
  useQuery({
    queryKey: ['playlist', id],
    queryFn: () => get<PlaylistDetail>(`/playlists/${id}`),
    enabled: id !== undefined,
  })

export const useBlocklist = () => useQuery({ queryKey: ['blocklist'], queryFn: () => get<Blocklist>('/blocklist') })
export function useIsBlocked(kind: BlockKind, id: string) {
  const { data } = useBlocklist()
  const list = kind === 'tag' ? data?.tags : kind === 'performer' ? data?.performers : data?.studios
  return !!list?.some((x) => x.id === id)
}

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
export const saveActivity = (id: string, resumeTime: number, playDuration: number) =>
  send('POST', `/scenes/${id}/activity`, { resumeTime, playDuration })

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

// Blocking changes what every list returns, so drop all list caches.
function invalidateLists(qc: QueryClient) {
  for (const key of ['blocklist', 'scenes', 'home', 'performers', 'studios', 'tags', 'search', 'related']) {
    qc.invalidateQueries({ queryKey: [key] })
  }
}

export function useBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, id, blocked }: { kind: BlockKind; id: string; blocked: boolean }) =>
      send(blocked ? 'PUT' : 'DELETE', `/blocklist/${kind}/${id}`),
    onSuccess: () => invalidateLists(qc),
  })
}

export function usePlaylistMutations() {
  const qc = useQueryClient()
  const refresh = (id?: number, sceneId?: string) => {
    qc.invalidateQueries({ queryKey: ['playlists'] })
    if (id !== undefined) qc.invalidateQueries({ queryKey: ['playlist', id] })
    if (sceneId) {
      qc.invalidateQueries({ queryKey: ['scene', sceneId] })
      qc.invalidateQueries({ queryKey: ['scene-playlists', sceneId] })
    }
    qc.invalidateQueries({ queryKey: ['favorite-scenes'] })
  }
  return {
    create: useMutation({
      mutationFn: (b: { name: string; description?: string | null; sceneId?: string }) =>
        send<{ id: number }>('POST', '/playlists', b),
      onSuccess: (_r, b) => refresh(undefined, b.sceneId),
    }),
    update: useMutation({
      mutationFn: ({ id, ...b }: { id: number; name: string; description: string | null }) => send('PUT', `/playlists/${id}`, b),
      onSuccess: (_r, b) => refresh(b.id),
    }),
    remove: useMutation({
      mutationFn: (id: number) => send('DELETE', `/playlists/${id}`),
      onSuccess: () => refresh(),
    }),
    add: useMutation({
      mutationFn: ({ id, sceneId }: { id: number; sceneId: string }) => send('POST', `/playlists/${id}/items`, { sceneId }),
      onSuccess: (_r, b) => refresh(b.id, b.sceneId),
    }),
    removeItem: useMutation({
      mutationFn: ({ id, sceneId }: { id: number; sceneId: string }) => send('DELETE', `/playlists/${id}/items/${sceneId}`),
      onSuccess: (_r, b) => refresh(b.id, b.sceneId),
    }),
    reorder: useMutation({
      mutationFn: ({ id, sceneIds }: { id: number; sceneIds: string[] }) => send('PUT', `/playlists/${id}/order`, { sceneIds }),
      onMutate: ({ id, sceneIds }) =>
        qc.setQueryData<PlaylistDetail>(['playlist', id], (d) => {
          if (!d) return d
          const byId = new Map(d.items.map((s) => [s.id, s]))
          return { ...d, items: sceneIds.map((s) => byId.get(s)!).filter(Boolean) }
        }),
      onSettled: (_r, _e, b) => refresh(b.id),
    }),
  }
}

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => get<Settings>('/settings'), staleTime: Infinity })

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => send<Settings>('PUT', '/settings', patch),
    onMutate: (patch) => qc.setQueryData<Settings>(['settings'], (d) => d && { ...d, ...patch }),
    onSuccess: (s, patch) => {
      qc.setQueryData(['settings'], s)
      // performer defaults change every list
      if (patch.people) qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'settings' })
      else qc.invalidateQueries({ queryKey: ['search'] })
    },
  })
}

// Videos' hearts: membership in the built-in Favorites playlist, loaded once as a set.
const NO_FAVORITES: ReadonlySet<string> = new Set()
const toSet = (ids: string[]): ReadonlySet<string> => new Set(ids)
export function useFavoriteScenes(): ReadonlySet<string> {
  const { data } = useQuery({ queryKey: ['favorite-scenes'], queryFn: () => get<string[]>('/favorites'), staleTime: Infinity, select: toSet })
  return data ?? NO_FAVORITES
}

export function useToggleFavoriteScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => send(favorite ? 'PUT' : 'DELETE', `/favorites/${id}`),
    onMutate: ({ id, favorite }) =>
      qc.setQueryData<string[]>(['favorite-scenes'], (d = []) => (favorite ? [...new Set([...d, id])] : d.filter((x) => x !== id))),
    onSettled: (_r, _e, { id }) => {
      qc.invalidateQueries({ queryKey: ['favorite-scenes'] })
      qc.invalidateQueries({ queryKey: ['playlists'] })
      qc.invalidateQueries({ queryKey: ['playlist'] })
      qc.invalidateQueries({ queryKey: ['scene-playlists', id] })
    },
  })
}

// Which playlists a scene is in; loaded when its Save menu opens.
export const useScenePlaylists = (id: string, enabled: boolean) =>
  useQuery({ queryKey: ['scene-playlists', id], queryFn: () => get<number[]>(`/scenes/${id}/playlists`), enabled })

export const useCacheStats = () =>
  useQuery({ queryKey: ['cache-stats'], queryFn: () => get<CacheStats>('/admin/cache'), refetchInterval: 5000, staleTime: 0 })

export function useClearCache() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scope: CacheScope) => send('POST', '/admin/cache/clear', { scope }),
    onSuccess: () => qc.invalidateQueries(),
  })
}

// Pre-fetch every image and preview into the server's cache (also runs nightly).
export function useWarmCache() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => send('POST', '/admin/cache/warm'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cache-stats'] }),
  })
}

export const authApi = {
  session: () => get<{ required: boolean; authenticated: boolean }>('/auth/session'),
  login: (password: string) => send('POST', '/auth/login', { password }),
  logout: () => send('POST', '/auth/logout'),
}

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

// --- stations ----------------------------------------------------------------------

export const useStations = () => useQuery({ queryKey: ['stations'], queryFn: () => get<SavedStation[]>('/stations') })

export function useStationMutations() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: ['stations'] })
  return {
    add: useMutation({ mutationFn: (b: StationInput) => send<{ id: number }>('POST', '/stations', b), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, ...patch }: { id: number } & Partial<Omit<StationInput, 'from'>>) => send('PUT', `/stations/${id}`, patch),
      onMutate: ({ id, ...patch }) => qc.setQueryData<SavedStation[]>(['stations'], (d) => d?.map((s) => (s.id === id ? { ...s, ...patch } : s))),
      onSettled: done,
    }),
    remove: useMutation({
      mutationFn: (id: number) => send('DELETE', `/stations/${id}`),
      onMutate: (id) => qc.setQueryData<SavedStation[]>(['stations'], (d) => d?.filter((s) => s.id !== id)),
      onSettled: done,
    }),
    reorder: useMutation({ mutationFn: (ids: number[]) => send('PUT', '/stations/order', { ids }), onSuccess: done }),
  }
}

// Where each station was left, newest first (saved while a station plays).
export const useStationResumes = () =>
  useQuery({ queryKey: ['station-resume'], queryFn: () => get<StationResume[]>('/stations/resume'), staleTime: 30_000 })
export const saveStationResume = (key: string, sceneId: string, seconds: number) =>
  send('PUT', '/stations/resume', { key, sceneId, seconds }).then(() => queryClient.invalidateQueries({ queryKey: ['station-resume'] }))

// A station card's preview: how many videos it plays and a few screenshots to cycle through
// (reshuffled daily). A drifting station has no count; its covers are the starting video's related ones.
const today = () => Math.floor(Date.now() / 86_400_000)
export function useStationPreview(query: SceneQuery, from?: string) {
  const [day] = useState(today) // the day the card was first shown; a tab left open overnight keeps it
  return useQuery({
    queryKey: ['station-preview', query, from, day],
    queryFn: async (): Promise<{ total: number | null; covers: string[] }> => {
      if (from) {
        const related = await get<SceneCard[]>(`/scenes/${from}/related`)
        return { total: null, covers: related.slice(0, 8).map((s) => s.screenshot) }
      }
      // a seed per station, so stations that overlap do not open on the same picture
      const seed = day + [...JSON.stringify(query)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100_000, 7)
      const r = await get<Page<SceneCard>>(`/scenes${qs({ ...query, sort: 'random', seed, perPage: 8 })}`)
      return { total: r.total, covers: r.items.map((s) => s.screenshot) }
    },
    staleTime: 10 * 60_000,
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

// --- tags as tiles ----------------------------------------------------------------

export const useTagTiles = () =>
  useQuery({ queryKey: ['tags', 'tiles'], queryFn: () => get<TagTile[]>('/tags/tiles'), staleTime: 5 * 60_000 })

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

// --- per-studio intro skip ------------------------------------------------------------

export function useIntroSkip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ studioId, seconds }: { studioId: string; seconds: number | null }) =>
      send<Settings>('PUT', `/studios/${studioId}/intro`, { seconds }),
    onSuccess: (s) => qc.setQueryData(['settings'], s),
  })
}

// --- bulk actions (multi-select) --------------------------------------------------------

export function useBulk() {
  const qc = useQueryClient()
  const done = () => {
    qc.invalidateQueries({ queryKey: ['playlists'] })
    qc.invalidateQueries({ queryKey: ['playlist'] })
    qc.invalidateQueries({ queryKey: ['favorite-scenes'] })
    qc.invalidateQueries({ queryKey: ['scene-playlists'] })
  }
  return {
    favorite: useMutation({ mutationFn: (sceneIds: string[]) => send('POST', '/favorites', { sceneIds }), onSuccess: done }),
    toPlaylist: useMutation({
      mutationFn: ({ id, sceneIds }: { id: number; sceneIds: string[] }) => send('POST', `/playlists/${id}/items`, { sceneIds }),
      onSuccess: done,
    }),
    newPlaylist: useMutation({
      mutationFn: async ({ name, sceneIds }: { name: string; sceneIds: string[] }) => {
        const { id } = await send<{ id: number }>('POST', '/playlists', { name })
        await send('POST', `/playlists/${id}/items`, { sceneIds })
        return id
      },
      onSuccess: done,
    }),
  }
}

// --- deleting scenes (file, Whisparr entry, Stash scene) --------------------------------

export const useFeatures = () => useQuery({ queryKey: ['features'], queryFn: () => get<Features>('/features'), staleTime: Infinity })

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
