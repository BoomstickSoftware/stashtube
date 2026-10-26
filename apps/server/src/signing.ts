// Signed playback links. AirPlay receivers (and other players that fetch the URL themselves)
// have no session cookie, so a scene's playback URLs carry `st=<expiry>.<hmac>`: valid for
// that one scene's video (direct file, HLS playlist and segments), nothing else.
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

// The scene a /media path plays, if it is a playback path (not images or sprites).
export function playbackScene(path: string): string | null {
  const m = /^\/media\/(?:play\/(\d+)$|stash\/scene\/(\d+)\/stream)/.exec(path)
  return m ? (m[1] ?? m[2]) : null
}
