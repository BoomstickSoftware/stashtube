import type { CacheScope, CacheStats, Features, Settings } from '@flix/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, send } from './client'

// Settings, what the server has enabled, the admin cache controls, and the optional login.

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => get<Settings>('/settings'), staleTime: Infinity })

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => send<Settings>('PUT', '/settings', patch),
    onMutate: (patch) => qc.setQueryData<Settings>(['settings'], (d) => d && { ...d, ...patch }),
    onSuccess: (s, patch) => {
      qc.setQueryData(['settings'], s)
      // performer defaults change every list; the Featured dials only Home. (The gender switch
      // is the Performers page's own since 2026-10-31 and no longer reaches search.)
      if (patch.people) qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'settings' })
      else if (patch.featured) qc.invalidateQueries({ queryKey: ['home'] })
    },
  })
}

export const useFeatures = () => useQuery({ queryKey: ['features'], queryFn: () => get<Features>('/features'), staleTime: Infinity })

// --- admin: the server's caches ------------------------------------------------------

export const useCacheStats = () =>
  useQuery({ queryKey: ['cache-stats'], queryFn: () => get<CacheStats>('/admin/cache'), refetchInterval: 5000, staleTime: 0 })

export function useClearCache() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scope: CacheScope) => send('POST', '/admin/cache/clear', { scope }),
    onSuccess: () => qc.invalidateQueries(),
  })
}

// Pre-fetch every image and preview into the server's cache (also runs nightly).
export function useWarmCache() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => send('POST', '/admin/cache/warm'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cache-stats'] }),
  })
}

// --- login ----------------------------------------------------------------------------

export const authApi = {
  session: () => get<{ required: boolean; authenticated: boolean }>('/auth/session'),
  login: (password: string) => send('POST', '/auth/login', { password }),
  logout: () => send('POST', '/auth/logout'),
}
