// What keeps other web pages away from flix. There is no login in production, so anything a
// browser on the LAN can be tricked into sending would be obeyed:
// - a page on another site could POST to /api (a "simple" text/plain request needs no
//   preflight), e.g. /api/scenes/delete; state-changing requests from another site are refused;
// - a public domain re-pointed at flix's address (DNS rebinding) would make flix same-origin to
//   that site; only requests addressed to an IP, localhost or a local-only name are served;
// - framing (click-jacking a Delete), MIME sniffing and Referer leaks are switched off by
//   headers.
import type { MiddlewareHandler } from 'hono'

// Names that cannot be registered on the public internet, so no outside site can own them.
const LOCAL_SUFFIX = /\.(lan|local|localdomain|internal|home\.arpa|svc|cluster\.local)$/
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

// Is this Host (or an Origin's host) one only the LAN can mean? Ports are ignored.
export function localHost(host: string | undefined | null): boolean {
  if (!host) return false
  const h = host.toLowerCase().replace(/:\d+$/, '')
  if (h.startsWith('[')) return true // an IPv6 literal
  return IPV4.test(h) || h === 'localhost' || !h.includes('.') || LOCAL_SUFFIX.test(h)
}

// The host of an Origin header, or null for an opaque or malformed one.
const originHost = (origin: string): string | null => {
  try {
    return new URL(origin).host
  } catch {
    return null
  }
}

// Probes and the deploy's smoke test must always get through.
const OPEN = new Set(['/healthz', '/readyz'])

export const hostGuard: MiddlewareHandler = async (c, next) => {
  if (OPEN.has(c.req.path) || localHost(c.req.header('host'))) return next()
  return c.text('This host does not serve flix.', 421)
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

// A browser marks where a request comes from (Sec-Fetch-Site, Origin); tools such as curl send
// neither and are let through, since they are not something a web page can make.
export const sameOriginWrites: MiddlewareHandler = async (c, next) => {
  if (SAFE.has(c.req.method)) return next()
  const site = c.req.header('sec-fetch-site')
  const origin = c.req.header('origin')
  const ok = site ? site === 'same-origin' || site === 'none' : !origin || originHost(origin) === c.req.header('host')
  if (ok) return next()
  return c.json({ error: 'cross-site request refused' }, 403)
}

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('x-content-type-options', 'nosniff')
  c.header('referrer-policy', 'no-referrer')
  c.header('x-frame-options', 'DENY')
  c.header('content-security-policy', "frame-ancestors 'none'")
}

// The CORS origin to allow for playback (hls.js fetching from MEDIA_ORIGIN while the page is on
// flix.lan): the asking origin when it is a local one, otherwise none.
export function playbackOrigin(origin: string | undefined): string | null {
  if (!origin) return null
  return localHost(originHost(origin)) ? origin : null
}
