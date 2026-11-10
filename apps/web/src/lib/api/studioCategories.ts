import type { Ref, StudioCategories, StudioCategoriesStatus, SyncRun } from '@flix/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, invalidateLists, send } from './client'

// Studio default categories (wiki features/studio-default-categories): flix keeps them on every
// video of the studio; saving or Sync now writes them in Stash.
export const useStudioCategories = (id: string) =>
  useQuery({ queryKey: ['studio-categories', id], queryFn: () => get<StudioCategories>(`/studios/${id}/categories`), staleTime: 5 * 60_000 })

export const useStudioCategoriesStatus = () =>
  useQuery({ queryKey: ['studio-categories'], queryFn: () => get<StudioCategoriesStatus>('/studio-categories'), staleTime: 60_000 })

export function useSetStudioCategories(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagIds: string[]) => send<{ tags: Ref[]; lastSync: SyncRun | null }>('PUT', `/studios/${id}/categories`, { tagIds }),
    onSuccess: (r) => {
      qc.setQueryData(['studio-categories', id], { tags: r.tags })
      qc.invalidateQueries({ queryKey: ['studio-categories'] })
      qc.invalidateQueries({ queryKey: ['scene'] })
      invalidateLists(qc)
    },
  })
}

export function useSyncStudioCategories() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => send<StudioCategoriesStatus>('POST', '/studio-categories/sync'),
    onSuccess: (s) => {
      qc.setQueryData(['studio-categories'], s)
      qc.invalidateQueries({ queryKey: ['scene'] })
      invalidateLists(qc)
    },
  })
}
