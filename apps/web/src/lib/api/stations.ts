import type { SavedStation, SceneQuery, StationInput, StationPreview, StationPreviews, StationResume } from '@flix/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { get, queryClient, send } from './client'

// Stations: the saved list and its edits, where each was left, and the preview tiles.

export const useStations = () => useQuery({ queryKey: ['stations'], queryFn: () => get<SavedStation[]>('/stations') })

export function useStationMutations() {
  const qc = useQueryClient()
  // the cards' counts and screenshots are keyed by day, not by the stations, so they go too
  const done = () => {
    qc.invalidateQueries({ queryKey: ['stations'] })
    qc.invalidateQueries({ queryKey: ['station-previews'] })
  }
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
      onSettled: () => {
        done()
        qc.invalidateQueries({ queryKey: ['station-resume'] }) // the server drops its resume row
      },
    }),
    reorder: useMutation({ mutationFn: (ids: number[]) => send('PUT', '/stations/order', { ids }), onSuccess: done }),
  }
}

// Where each station was left, newest first (saved while a station plays).
export const useStationResumes = () =>
  useQuery({ queryKey: ['station-resume'], queryFn: () => get<StationResume[]>('/stations/resume'), staleTime: 30_000 })
export const saveStationResume = (key: string, sceneId: string, seconds: number) =>
  send('PUT', '/stations/resume', { key, sceneId, seconds }).then(() => queryClient.invalidateQueries({ queryKey: ['station-resume'] }))

// Every station card's preview in one request: how many videos each plays and a few screenshots
// to cycle through (reshuffled daily). Saved stations come by id; the ad hoc `queries` (the
// quick-start cards) come back under `JSON.stringify(query)`, so look them up with `previewFor`.
const today = () => Math.floor(Date.now() / 86_400_000)
export function useStationPreviews(queries: SceneQuery[] = []) {
  const [day] = useState(today) // the day the page was first shown; a tab left open overnight keeps it
  const keys = queries.map((q) => JSON.stringify(q))
  return useQuery({
    queryKey: ['station-previews', day, keys],
    queryFn: () => get<StationPreviews>(`/stations/previews?day=${day}${keys.map((k) => `&q=${encodeURIComponent(k)}`).join('')}`),
    staleTime: 10 * 60_000,
  })
}
export const previewFor = (p: StationPreviews | undefined, s: { id?: number; query: SceneQuery }): StationPreview | undefined =>
  s.id ? p?.stations[s.id] : p?.queries[JSON.stringify(s.query)]
