import { type Query, QueryClient } from '@tanstack/react-query'

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

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
      refetchOnWindowFocus: false,
    },
  },
})

// Queries kept in localStorage between visits (see main.tsx): small, and what the first
// screen needs. They must outlive the default 5-minute gcTime, or leaving the page for a
// while would drop them from storage too.
const PERSISTED = ['session', 'home', 'settings', 'favorite-scenes', 'playlists', 'blocklist']
export const PERSIST_MAX_AGE = 7 * 24 * 3_600_000
for (const key of PERSISTED) queryClient.setQueryDefaults([key], { gcTime: PERSIST_MAX_AGE })
export const persistQuery = (q: Query) => q.state.status === 'success' && PERSISTED.includes(q.queryKey[0] as string)

// Blocking or hiding changes what every list returns, so drop all list caches.
export function invalidateLists(qc: QueryClient) {
  for (const key of ['blocklist', 'scenes', 'home', 'performers', 'studios', 'tags', 'search', 'related']) {
    qc.invalidateQueries({ queryKey: [key] })
  }
}
