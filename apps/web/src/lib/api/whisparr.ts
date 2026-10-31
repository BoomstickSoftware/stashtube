import type { WantedList, WantedScene } from '@flix/shared'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

// Fetch one scene. A scene Whisparr lists is monitored and searched; one only StashDB lists is
// added to Whisparr first. The server refuses anything but a single id either way.
export function useGetScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (w: WantedScene) =>
      w.whisparrId !== null ? send<WantedScene>('POST', `/whisparr/get/${w.whisparrId}`) : send<WantedScene>('POST', `/whisparr/get-remote/${w.stashdbId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whisparr'] }),
  })
}
