import type {
  BlockKind,
  CacheScope,
  CacheStats,
  Blocklist,
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
  TagTile,
} from '@flix/shared'
import {
  keepPreviousData,
  type Query,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

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
const PERSISTED = ['home', 'settings', 'favorite-scenes', 'playlists', 'blocklist']
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

// --- writes ---------------------------------------------------------------------

// Patch a scene everywhere it is cached: detail, lists, home rows, playlists.
function patchScene(qc: QueryClient, id: string, patch: Partial<SceneCard>) {
  const fix = (s: SceneCard) => (s.id === id ? { ...s, ...patch } : s)
  qc.setQueryData<SceneDetail>(['scene', id], (d) => d && { ...d, ...patch })
  qc.setQueriesData<{ pages: Page<SceneCard>[] }>({ queryKey: ['scenes'] }, (d) =>
    d && { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map(fix) })) },
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
        d && { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === id ? { ...x, favorite } : x)) })) },
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
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s)
      qc.invalidateQueries({ queryKey: ['search'] })
    },
  })
}

// Videos' hearts: membership in the built-in Favorites playlist, loaded once as a set.
export function useFavoriteScenes() {
  const { data } = useQuery({ queryKey: ['favorite-scenes'], queryFn: () => get<string[]>('/favorites'), staleTime: Infinity })
  return new Set(data ?? [])
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
