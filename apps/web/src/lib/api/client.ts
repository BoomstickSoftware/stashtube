import { MutationCache, type Query, QueryClient } from '@tanstack/react-query'
import { readStored } from '../storage'
import { showToast } from '../toast'

// The transport every hook uses: one fetch wrapper with a timeout, an error that carries the
// status, the query string builder, and the app's QueryClient with its persistence rules.
// Domain modules import from here; this file imports from none of them.

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const TIMEOUT = 45_000 // ms; a request that never answers is retried instead of spinning forever

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (res.status === 401 && !path.startsWith('/auth')) {
    window.dispatchEvent(new Event('flix:login-required'))
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, err?.error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const get = <T>(path: string) => request<T>('GET', path)
export const send = <T = void>(method: string, path: string, body?: unknown) => request<T>(method, path, body)

export function qs(params: object): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    p.set(k, v === true ? '1' : String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

// Every failed write says so, once, in the toast: Stash's reason when the server passed one on
// ("Stash: database is locked"), a short generic line otherwise. The cache's handler runs for
// every mutation, including those with their own onError (a per-hook onError would replace a
// defaultOptions one). A hook that renders the error itself opts out with `meta: { silent: true }`.
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (e, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return
      showToast(e instanceof ApiError ? e.message : "Couldn't save that")
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
      // back in the foreground (an installed app resumed after hours), stale data refreshes
      refetchOnWindowFocus: true,
    },
  },
})

// Queries kept in localStorage between visits (see main.tsx): small, and what the first
// screen needs. They must outlive the default 5-minute gcTime, or leaving the page for a
// while would drop them from storage too.
const PERSISTED = ['session', 'home', 'settings', 'favorite-scenes', 'playlists', 'blocklist']
export const PERSIST_MAX_AGE = 7 * 24 * 3_600_000
for (const key of PERSISTED) queryClient.setQueryDefaults([key], { gcTime: PERSIST_MAX_AGE })
// Only the current Home seed's feed is stored (a feed per seed would fill localStorage);
// the seed itself is kept by lib/api/home.ts.
export const HOME_SEED_KEY = 'flix.homeSeed'
const isCurrentHome = (key: readonly unknown[]) => key[0] !== 'home' || key[1] === readStored(HOME_SEED_KEY, (v) => (v as { seed?: string } | undefined)?.seed)
export const persistQuery = (q: Query) => q.state.status === 'success' && PERSISTED.includes(q.queryKey[0] as string) && isCurrentHome(q.queryKey)
// What Back returns to: a list, a video and its related row outlive a long watch (the default
// 5 minutes would drop the list you came from, and with it the scroll position).
for (const key of ['scenes', 'scene', 'related']) queryClient.setQueryDefaults([key], { gcTime: 30 * 60_000 })

// Blocking or hiding changes what every list returns, so drop all list caches.
export function invalidateLists(qc: QueryClient) {
  for (const key of ['blocklist', 'scenes', 'home', 'performers', 'studios', 'tags', 'search', 'related']) {
    qc.invalidateQueries({ queryKey: [key] })
  }
}
