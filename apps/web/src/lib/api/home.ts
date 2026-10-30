import type { FeaturedWeights, HomeRow, SavedRow, SceneCard, SceneQuery } from '@flix/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, send } from './client'

// The Home page: its rows, the Featured dials' live preview, and the pinned rows.

// `seed` is the visit's: the Featured row and hero keep their order across refetches until
// the page makes a new one.
export const useHome = (seed: string) => useQuery({ queryKey: ['home', seed], queryFn: () => get<HomeRow[]>(`/home?seed=${seed}`), placeholderData: keepPreviousData })

// Settings' live preview of the Featured dials, unsaved.
export const useFeaturedPreview = (weights: FeaturedWeights, enabled: boolean) =>
  useQuery({
    queryKey: ['featured-preview', weights],
    queryFn: () => send<SceneCard[]>('POST', '/featured/preview', { weights, seed: 'preview', limit: 12 }),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    enabled,
  })

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
