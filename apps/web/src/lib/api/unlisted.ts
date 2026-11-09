import type { BlockKind, SceneCard, Unlisted } from '@flix/shared'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { get, invalidateLists, send } from './client'

// Unlisted (wiki features/vault): categories, performers, studios and single videos kept off
// everything flix picks for you and listed in the Vault. Any change refetches every list and
// Home, and the blocklist, since unlisting something blocked unblocks it and the reverse.

export const useUnlisted = () => useQuery({ queryKey: ['unlisted'], queryFn: () => get<Unlisted>('/unlisted') })
export const useUnlistedScenes = () => useQuery({ queryKey: ['unlisted', 'scenes'], queryFn: () => get<SceneCard[]>('/unlisted/scenes') })

export function useIsUnlisted(kind: BlockKind, id: string) {
  const { data } = useUnlisted()
  const list = kind === 'tag' ? data?.tags : kind === 'performer' ? data?.performers : data?.studios
  return !!list?.some((x) => x.id === id)
}

const refresh = (qc: QueryClient) => {
  qc.invalidateQueries({ queryKey: ['unlisted'] })
  invalidateLists(qc) // includes the blocklist
}

export function useUnlist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, id, unlisted }: { kind: BlockKind; id: string; unlisted: boolean }) => send(unlisted ? 'PUT' : 'DELETE', `/unlisted/${kind}/${id}`),
    onMutate: ({ kind, id, unlisted }) => {
      if (unlisted) return
      const key = kind === 'tag' ? 'tags' : kind === 'performer' ? 'performers' : 'studios'
      qc.setQueryData<Unlisted>(['unlisted'], (d) => d && { ...d, [key]: d[key].filter((x) => x.id !== id) })
    },
    onSettled: () => refresh(qc),
  })
}

// One video, by hand (the "Unlisted" Stash tag).
export function useUnlistScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, unlisted }: { id: string; unlisted: boolean }) => send(unlisted ? 'PUT' : 'DELETE', `/scenes/${id}/unlisted`),
    onSettled: (_r, _e, { id }) => {
      refresh(qc)
      qc.invalidateQueries({ queryKey: ['scene', id] })
    },
  })
}
