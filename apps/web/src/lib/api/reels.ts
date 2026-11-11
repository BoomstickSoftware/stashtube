import type { Reel, ReelDetail, ReelProposal, ReelRef, ReelTransition } from '@flix/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, qs, send } from './client'
import { useFeatures } from './settings'

// Reels (wiki features/reels): ordered ranges of library videos, played as one sequence.

// Whether this server has reels switched on (FLIX_REELS=1).
export const useReelsEnabled = () => useFeatures().data?.reels === true

export const useReels = (enabled = true) => useQuery({ queryKey: ['reels'], queryFn: () => get<Reel[]>('/reels'), enabled })

// Published reels filed under a performer, category or studio, or the ones waiting for review:
// the shelves beside videos. Nothing is asked while reels are switched off.
export interface ReelFilter {
  performer?: string
  tag?: string
  studio?: string
  state?: 'review' | 'published'
}
export function useReelShelf(filter: ReelFilter) {
  const on = useReelsEnabled()
  return useQuery({ queryKey: ['reels', filter], queryFn: () => get<Reel[]>(`/reels${qs(filter)}`), enabled: on })
}

// What the review page offers to file the reel under.
export const useReelProposal = (id: number, enabled: boolean) =>
  useQuery({ queryKey: ['reel', id, 'proposal'], queryFn: () => get<ReelProposal>(`/reels/${id}/proposal`), enabled })

// Where the viewer stopped and whether it counts as a play: sent on its own while a built reel
// plays, so the caller checks isPrivate() first. Not a mutation: nothing on screen depends on it.
export const saveReelActivity = (id: number, a: { resumeSec?: number; played?: boolean }) => send('PUT', `/reels/${id}/activity`, a).catch(() => {})

// While a build waits for the builder or is being rendered, the reel is asked for again every
// few seconds so its progress shows; a reel waiting for the night is not polled.
export const useReel = (id: number | undefined) =>
  useQuery({
    queryKey: ['reel', id],
    queryFn: () => get<ReelDetail>(`/reels/${id}`),
    enabled: id !== undefined,
    refetchInterval: (q) => {
      const b = q.state.data?.build
      return b && (b.status === 'building' || (b.status === 'queued' && b.now)) ? 5000 : false
    },
  })

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
    // Queue the reel's build: tonight's window, or `now` for as soon as the builder asks.
    build: useMutation({
      mutationFn: ({ id, now }: { id: number; now: boolean }) => send<{ id: number }>('POST', `/reels/${id}/build`, { now }),
      onSuccess: (_r, b) => refresh(b.id),
    }),
    cancelBuild: useMutation({
      mutationFn: (id: number) => send('DELETE', `/reels/${id}/build`),
      onSettled: (_r, _e, id) => refresh(id),
    }),
    approve: useMutation({
      mutationFn: ({ id, ...b }: { id: number; name?: string; performers: ReelRef[]; tags: ReelRef[]; studios: ReelRef[] }) => send('POST', `/reels/${id}/approve`, b),
      onSuccess: (_r, b) => refresh(b.id),
    }),
    sendBack: useMutation({
      mutationFn: (id: number) => send('POST', `/reels/${id}/send-back`),
      onSuccess: (_r, id) => refresh(id),
    }),
    rate: useMutation({
      mutationFn: ({ id, rating }: { id: number; rating: number | null }) => send('PUT', `/reels/${id}/rating`, { rating }),
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
