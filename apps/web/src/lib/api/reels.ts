import type { Reel, ReelDetail, ReelTransition } from '@flix/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, send } from './client'
import { useFeatures } from './settings'

// Reels (wiki features/reels): ordered ranges of library videos, played as one sequence.

// Whether this server has reels switched on (FLIX_REELS=1).
export const useReelsEnabled = () => useFeatures().data?.reels === true

export const useReels = (enabled = true) => useQuery({ queryKey: ['reels'], queryFn: () => get<Reel[]>('/reels'), enabled })

export const useReel = (id: number | undefined) =>
  useQuery({ queryKey: ['reel', id], queryFn: () => get<ReelDetail>(`/reels/${id}`), enabled: id !== undefined })

export function useReelMutations() {
  const qc = useQueryClient()
  const refresh = (id?: number) => {
    qc.invalidateQueries({ queryKey: ['reels'] })
    if (id !== undefined) qc.invalidateQueries({ queryKey: ['reel', id] })
  }
  return {
    create: useMutation({
      mutationFn: (b: { name: string; transition?: ReelTransition }) => send<{ id: number }>('POST', '/reels', b),
      onSuccess: () => refresh(),
    }),
    update: useMutation({
      mutationFn: ({ id, ...b }: { id: number; name?: string; transition?: ReelTransition }) => send('PUT', `/reels/${id}`, b),
      onSuccess: (_r, b) => refresh(b.id),
    }),
    // Delete with an Undo: the reel leaves the list now and is deleted after `ms`, unless the
    // returned function is called first (the same shape as playlists and stations).
    removeLater: (id: number, ms = 6000) => {
      qc.setQueryData<Reel[]>(['reels'], (d) => d?.filter((r) => r.id !== id))
      const timer = window.setTimeout(() => {
        send('DELETE', `/reels/${id}`).finally(() => refresh())
      }, ms)
      return () => {
        clearTimeout(timer)
        qc.invalidateQueries({ queryKey: ['reels'] })
      }
    },
    addClip: useMutation({
      mutationFn: ({ id, ...b }: { id: number; sceneId: string; start: number; end: number }) => send<{ id: number }>('POST', `/reels/${id}/clips`, b),
      onSuccess: (_r, b) => refresh(b.id),
    }),
    updateClip: useMutation({
      mutationFn: ({ id, clipId, ...b }: { id: number; clipId: number; start?: number; end?: number; transition?: ReelTransition | null }) =>
        send('PUT', `/reels/${id}/clips/${clipId}`, b),
      onSuccess: (_r, b) => refresh(b.id),
    }),
    removeClip: useMutation({
      mutationFn: ({ id, clipId }: { id: number; clipId: number }) => send('DELETE', `/reels/${id}/clips/${clipId}`),
      onSuccess: (_r, b) => refresh(b.id),
    }),
    reorder: useMutation({
      mutationFn: ({ id, clipIds }: { id: number; clipIds: number[] }) => send('PUT', `/reels/${id}/clips/order`, { clipIds }),
      // the list shows the new order at once
      onMutate: ({ id, clipIds }) =>
        qc.setQueryData<ReelDetail>(['reel', id], (d) => d && { ...d, clips: clipIds.map((cid) => d.clips.find((c) => c.id === cid)).filter((c) => !!c) }),
      onSettled: (_r, _e, b) => refresh(b.id),
    }),
  }
}
