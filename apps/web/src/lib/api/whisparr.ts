import type { WantedScene, WhisparrActivity } from '@flix/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, send } from './client'
import { useFeatures } from './settings'

// Whisparr: the scenes it knows about but has not downloaded, and the one write flix makes to
// it, fetching a single scene the user clicked. Everything is off unless the server has Whisparr.

function useWhisparrOn() {
  const { data } = useFeatures()
  return !!data?.whisparr
}

export function useWanted(kind: 'performer' | 'studio', id: string) {
  const on = useWhisparrOn()
  return useQuery({
    queryKey: ['whisparr', kind, id],
    queryFn: () => get<WantedScene[]>(`/whisparr/${kind}/${id}`),
    enabled: on,
    staleTime: 30_000,
  })
}

// Recent releases from favourite performers that are not in the library.
export function useWhisparrNew() {
  const on = useWhisparrOn()
  return useQuery({ queryKey: ['whisparr', 'new'], queryFn: () => get<WantedScene[]>('/whisparr/new'), enabled: on, staleTime: 60_000 })
}

export function useWhisparrActivity() {
  const on = useWhisparrOn()
  return useQuery({
    queryKey: ['whisparr', 'activity'],
    queryFn: () => get<WhisparrActivity>('/whisparr/activity'),
    enabled: on,
    staleTime: 20_000,
    refetchInterval: 30_000,
  })
}

// Monitor and search one scene. The server refuses anything but a single id.
export function useGetScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (whisparrId: number) => send<WantedScene>('POST', `/whisparr/get/${whisparrId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whisparr'] }),
  })
}
