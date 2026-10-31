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

// A request that never answers is retried instead of spinning forever. Longer than the server's
// 60 s Stash budget, so a slow Stash arrives as the server's own "Stash: no answer in 60 s" 502
// (which describeError explains) rather than as a bare client timeout.
const TIMEOUT = 65_000 // ms

// One sentence a person can act on, for ErrorBox and the failed-write toast, with the raw
// message kept as `detail` when it was replaced. Only Stash's 502s are reworded for reads:
// Stash's SQLite locks for minutes during a scan and cached pages keep working meanwhile.
export function describeError(error: unknown, kind: 'read' | 'write' = 'read'): { text: string; detail?: string } {
  if (error instanceof ApiError) {
    if (error.status === 502 && error.message.startsWith('Stash:')) {
      return {
        text:
          kind === 'read'
            ? 'Stash is busy or down (a scan locks it for a few minutes). Cached pages still work.'
            : 'Stash is busy or down (a scan locks it for a few minutes). Nothing was saved; try again later.',
        detail: error.message,
      }
    }
    return { text: error.message }
  }
  if (error instanceof Error) {
    // fetch itself failed: Chrome says "Failed to fetch", Safari "Load failed"; an abort is ours
    if (error instanceof TypeError || error.name === 'AbortError') return { text: 'No connection to flix. Check Wi-Fi, then try again.', detail: error.message }
    if (error.name === 'TimeoutError') return { text: `flix took more than ${TIMEOUT / 1000} s to answer. Try again in a moment.` }
    return { text: error.message }
  }
  return { text: 'Something went wrong' }
}

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

// Every failed write says so, once, in the toast: the server's reason when it passed one on
// (a Stash 502 reworded by describeError), a short generic line otherwise. The cache's handler
// runs for every mutation, including those with their own onError (a per-hook onError would
// replace a defaultOptions one). A hook that renders the error itself opts out with
// `meta: { silent: true }`.
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (e, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return
      showToast(e instanceof ApiError ? describeError(e, 'write').text : "Couldn't save that")
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
