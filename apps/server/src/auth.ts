// Optional single-password login. With FLIX_PASSWORD unset every request passes;
// the app is then only as private as the network it is on.
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { timingSafeEqual } from 'node:crypto'
import { config } from './config.ts'
import { playbackScene, verifyScene } from './signing.ts'

const COOKIE = 'flix_session'
const MAX_AGE = 60 * 60 * 24 * 30

export const auth = new Hono()

const same = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

auth.get('/session', async (c) => {
  if (!config.password) return c.json({ required: false, authenticated: true })
  const ok = !!(await getSignedCookie(c, config.sessionSecret!, COOKIE))
  return c.json({ required: true, authenticated: ok })
})

// Behind Cloudflare and ingress-nginx the client is in CF-Connecting-IP / X-Forwarded-For,
// and the scheme the browser used is in X-Forwarded-Proto.
const clientIp = (c: Context) =>
  c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'direct'
const isHttps = (c: Context) =>
  (c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '')) === 'https'

// Failed logins: at most 5 per client and 20 overall per 15 minutes (the overall cap stops
// guessing from many addresses). Successful logins do not count.
const WINDOW = 15 * 60_000
const failures = new Map<string, number[]>()
function limited(ip: string): boolean {
  const since = Date.now() - WINDOW
  for (const [k, v] of failures) {
    const kept = v.filter((t) => t > since)
    if (kept.length) failures.set(k, kept)
    else failures.delete(k)
  }
  const all = [...failures.values()].reduce((n, v) => n + v.length, 0)
  return (failures.get(ip)?.length ?? 0) >= 5 || all >= 20
}

auth.post('/login', async (c) => {
  if (!config.password) return c.body(null, 204)
  const ip = clientIp(c)
  if (limited(ip)) return c.json({ error: 'too many attempts, try again later' }, 429)
  const body = (await c.req.json().catch(() => ({}))) as { password?: string }
  if (!body.password || !same(body.password, config.password)) {
    failures.set(ip, [...(failures.get(ip) ?? []), Date.now()])
    console.warn(`failed login from ${ip}`)
    return c.json({ error: 'wrong password' }, 401)
  }
  await setSignedCookie(c, COOKIE, '1', config.sessionSecret!, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: MAX_AGE,
    secure: isHttps(c),
  })
  return c.body(null, 204)
})

auth.post('/logout', (c) => {
  deleteCookie(c, COOKIE, { path: '/' })
  return c.body(null, 204)
})

export const requireSession: MiddlewareHandler = async (c, next) => {
  if (!config.password) return next()
  if (await getSignedCookie(c, config.sessionSecret!, COOKIE)) return next()
  // A signed playback link stands in for the session on that scene's video only.
  const scene = playbackScene(c.req.path)
  if (scene && verifyScene(scene, c.req.query('st'))) return next()
  return c.json({ error: 'login required' }, 401)
}
