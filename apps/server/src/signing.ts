// Signed media links.
// - Playback: AirPlay receivers (and other players that fetch the URL themselves) have no
//   session cookie, so a scene's playback URLs carry `st=<expiry>.<hmac>`: valid for that one
//   scene's video (direct file, HLS playlist and segments), nothing else.
// - Remote covers: `/media/remote/<token>` names an upstream URL (a StashDB cover) as
//   `<base64url(url)>.<hmac>`, so only URLs the server itself handed out can be asked for; the
//   host allowlist (remote.ts) is checked as well, since without a password the key is fixed.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from './config.ts'

const TTL = 24 * 3600 // seconds

const key = () => config.sessionSecret ?? 'flix-unsigned' // unsigned mode: no password, links not checked

function mac(sceneId: string, exp: number) {
  return createHmac('sha256', key()).update(`media:scene:${sceneId}:${exp}`).digest('base64url')
}

export function signScene(sceneId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL
  return `${exp}.${mac(sceneId, exp)}`
}

export function verifyScene(sceneId: string, token: string | undefined | null): boolean {
  if (!token) return false
  const [expRaw, sig] = token.split('.')
  const exp = Number(expRaw)
  if (!Number.isInteger(exp) || exp < Date.now() / 1000 || !sig) return false
  const a = Buffer.from(sig)
  const b = Buffer.from(mac(sceneId, exp))
  return a.length === b.length && timingSafeEqual(a, b)
}

const macRemote = (url: string) => createHmac('sha256', key()).update(`media:remote:${url}`).digest('base64url')

// A token for `/media/remote/<token>`. No expiry: a cover's URL is stable and the browser may
// keep the image for a week; what bounds the proxy is the allowlist, not the clock.
export function signRemote(url: string): string {
  return `${Buffer.from(url).toString('base64url')}.${macRemote(url)}`
}

// The URL a remote token names, or null when it was not made here.
export function verifyRemote(token: string | undefined | null): string | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const encoded = token.slice(0, dot)
  const url = Buffer.from(encoded, 'base64url').toString('utf8')
  if (!url || Buffer.from(url).toString('base64url') !== encoded) return null
  const a = Buffer.from(token.slice(dot + 1))
  const b = Buffer.from(macRemote(url))
  return a.length === b.length && timingSafeEqual(a, b) ? url : null
}

// The scene a /media path plays, if it is a playback path (not images or sprites).
export function playbackScene(path: string): string | null {
  const m = /^\/media\/(?:play\/(\d+)$|stash\/scene\/(\d+)\/stream)/.exec(path)
  return m ? (m[1] ?? m[2]) : null
}
