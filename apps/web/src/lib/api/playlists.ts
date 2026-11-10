import type { Playlist, PlaylistDetail } from '@flix/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, send, SHARED_STALE } from './client'

// Playlists, the built-in Favorites playlist behind every video's heart, and the multi-select
// bulk actions that add to both.

export const usePlaylists = () => useQuery({ queryKey: ['playlists'], queryFn: () => get<Playlist[]>('/playlists') })

export const usePlaylist = (id: number | undefined) =>
  useQuery({
    queryKey: ['playlist', id],
    queryFn: () => get<PlaylistDetail>(`/playlists/${id}`),
    enabled: id !== undefined,
  })

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

// Videos' hearts: membership in the built-in Favorites playlist, loaded once as a set.
const NO_FAVORITES: ReadonlySet<string> = new Set()
const toSet = (ids: string[]): ReadonlySet<string> => new Set(ids)
export function useFavoriteScenes(): ReadonlySet<string> {
  const { data } = useQuery({ queryKey: ['favorite-scenes'], queryFn: () => get<string[]>('/favorites'), staleTime: SHARED_STALE, select: toSet })
  return data ?? NO_FAVORITES
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
