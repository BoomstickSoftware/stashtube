import type { EduTags } from '@flix/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, invalidateLists, send } from './client'

// The Edu section's categories (wiki features/edu-section): add or remove one from its tag page
// or Settings. Every list and Home are refetched, since the section changes what they hold.

export const useEduTags = () => useQuery({ queryKey: ['edu-tags'], queryFn: () => get<EduTags>('/edu/tags') })

export function useIsEdu(id: string) {
  const { data } = useEduTags()
  return !!data?.some((t) => t.id === id)
}

export function useSetEdu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, edu }: { id: string; edu: boolean }) => send(edu ? 'PUT' : 'DELETE', `/edu/tags/${id}`),
    onMutate: ({ id, edu }) => {
      if (!edu) qc.setQueryData<EduTags>(['edu-tags'], (d) => d?.filter((t) => t.id !== id))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['edu-tags'] })
      invalidateLists(qc)
    },
  })
}
