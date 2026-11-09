import type { CastStatus } from '@flix/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, invalidateLists, send } from './client'

// Cast categories (wiki features/cast): what each mix holds and the last sync; Sync now writes
// the categories in Stash.
export const useCast = (enabled = true) => useQuery({ queryKey: ['cast'], queryFn: () => get<CastStatus>('/cast'), staleTime: 60_000, enabled })

export function useSyncCast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => send<CastStatus>('POST', '/cast/sync'),
    onSuccess: (s) => {
      qc.setQueryData(['cast'], s)
      invalidateLists(qc)
    },
  })
}
