import type { PerformerWatch, SyncStatus, WantedList, WantedScene } from '@flix/shared'
import { type QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, send } from './client'
import { useFeatures } from './settings'

// Whisparr and StashDB: the scenes a performer or studio has that are not in the library, and the
// one write flix makes, fetching a single scene the user clicked (through Whisparr, which adds it
// first when only StashDB knew it). Everything is off unless the server has Whisparr.

function useWhisparrOn() {
  const { data } = useFeatures()
  return !!data?.whisparr
}

// Pages of missing scenes, newest first: StashDB's catalogue when the server has it, else
// Whisparr's list (one page).
export function useWanted(kind: 'performer' | 'studio', id: string) {
  const on = useWhisparrOn()
  return useInfiniteQuery({
    queryKey: ['whisparr', kind, id],
    queryFn: ({ pageParam }) => get<WantedList>(`/whisparr/${kind}/${id}?page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: on,
    staleTime: 30_000,
  })
}

// Recent releases from followed (Stash-favourite) performers that are not in the library.
export function useWhisparrNew() {
  const on = useWhisparrOn()
  return useQuery({ queryKey: ['whisparr', 'new'], queryFn: () => get<WantedScene[]>('/whisparr/new'), enabled: on, staleTime: 60_000 })
}

// The card as the server now sees it (state 'requested', a Whisparr id for a remote scene), in
// every shelf page and the Home row that holds it.
function patchWanted(qc: QueryClient, w: WantedScene) {
  const same = (x: WantedScene) => (w.stashdbId !== null && x.stashdbId === w.stashdbId) || (w.whisparrId !== null && x.whisparrId === w.whisparrId)
  const fix = (items: WantedScene[]) => items.map((x) => (same(x) ? w : x))
  qc.setQueriesData<{ pages: WantedList[] } | WantedScene[]>({ queryKey: ['whisparr'] }, (d) =>
    Array.isArray(d) ? fix(d) : d?.pages ? { ...d, pages: d.pages.map((p) => ({ ...p, items: fix(p.items) })) } : d,
  )
}

// Fetch one scene. A scene Whisparr lists is monitored and searched; one only StashDB lists is
// added to Whisparr first. The server refuses anything but a single id either way. The card
// shows "Requested" from the answer on, and the shelf refetches for Whisparr's own state.
export function useGetScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (w: WantedScene) =>
      w.whisparrId !== null ? send<WantedScene>('POST', `/whisparr/get/${w.whisparrId}`) : send<WantedScene>('POST', `/whisparr/get-remote/${w.stashdbId}`),
    onSuccess: (w) => {
      patchWanted(qc, w)
      qc.invalidateQueries({ queryKey: ['whisparr'] })
    },
  })
}

// --- the follow sync (server sync.ts) --------------------------------------------------

// Is Whisparr watching this performer's new releases, and is anything of theirs downloading.
export function usePerformerWatch(id: string) {
  const on = useWhisparrOn()
  return useQuery({ queryKey: ['whisparr', 'watch', id], queryFn: () => get<PerformerWatch>(`/whisparr/watch/performer/${id}`), enabled: on, staleTime: 30_000 })
}

// The sync's last run; polled while it runs.
export function useSyncStatus() {
  const on = useWhisparrOn()
  return useQuery({
    queryKey: ['sync'],
    queryFn: () => get<SyncStatus>('/sync'),
    enabled: on,
    refetchInterval: (q) => (q.state.data?.running ? 2000 : 60_000),
  })
}

export function useRunSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => send<SyncStatus>('POST', '/sync/run'),
    onSuccess: (s) => {
      qc.setQueryData(['sync'], s)
      qc.invalidateQueries({ queryKey: ['whisparr', 'watch'] })
    },
  })
}

// After a follow or block the server syncs ~10 s later; look again once it has.
export function refreshWatchSoon(qc: QueryClient) {
  setTimeout(() => {
    qc.invalidateQueries({ queryKey: ['whisparr', 'watch'] })
    qc.invalidateQueries({ queryKey: ['sync'] })
  }, 15_000)
}
