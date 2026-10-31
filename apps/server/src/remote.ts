// Covers that live outside the LAN: StashDB's, which Whisparr's `remoteUrl`s also point at.
// The browser never fetches them itself: the API hands out `/media/remote/<token>` and the
// server fetches, resizes and caches the image like any Stash asset (media.ts). Only these
// hosts are ever fetched, over https, and a redirect is followed only onto them.
import { signRemote, verifyRemote } from './signing.ts'

export const REMOTE_HOSTS = ['stashdb.org'] as const
const MAX_HOPS = 3 // redirects followed, each re-checked against the allowlist
export const REMOTE_TIMEOUT = 20_000 // ms for one cover, body included

// Is this a URL the proxy may fetch? https, an allowlisted host or a subdomain of one.
export function allowedRemote(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false
  const h = u.hostname.toLowerCase()
  return REMOTE_HOSTS.some((host) => h === host || h.endsWith(`.${host}`))
}

// The proxied URL for a cover, or null when there is none or it is not one we fetch.
export function remoteImageUrl(url: string | null | undefined): string | null {
  if (!url || !allowedRemote(url)) return null
  return `/media/remote/${signRemote(url)}`
}

// The upstream URL a `/media/remote/<token>` names, or null when the token is not ours or
// the host is not allowed (the second check matters in unsigned mode, where the key is fixed).
export function remoteUpstream(token: string | undefined | null): string | null {
  const url = verifyRemote(token)
  return url && allowedRemote(url) ? url : null
}

// Fetch a cover: redirects are followed by hand so every hop is allowlisted, and anything
// that is not an image is a 404 (the asset cache then remembers the miss briefly).
export async function fetchRemote(url: string, headers: Record<string, string>, fetchFn: typeof fetch = fetch): Promise<Response> {
  const signal = AbortSignal.timeout(REMOTE_TIMEOUT)
  let target = url
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!allowedRemote(target)) return new Response(null, { status: 404 })
    const res = await fetchFn(target, { headers, redirect: 'manual', signal })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel()
      target = new URL(location, target).href
      continue
    }
    if (res.ok && !(res.headers.get('content-type') ?? '').startsWith('image/')) {
      await res.body?.cancel()
      return new Response(null, { status: 404 })
    }
    return res
  }
  return new Response(null, { status: 404 })
}
