// PIN lock: a privacy screen over flix after a while idle or when coming back to the app. It is
// not security (the PIN hash sits in this browser's localStorage and clearing site data removes
// it); it keeps a glance at an unattended screen from showing anything.
//
// Settings (`flix.pin`, localStorage): the salted SHA-256 of the PIN, its length, the idle
// minutes (0 = never) and whether returning to the tab locks. The locked flag itself is in
// sessionStorage, so a reload while locked stays locked and a fresh visit starts unlocked.
import { useSyncExternalStore } from 'react'
import { readStored, writeStored } from './storage'

export interface PinSettings {
  hash: string
  salt: string
  length: number
  idleMinutes: number
  lockOnReturn: boolean
}

export const IDLE_CHOICES = [1, 5, 15, 30, 0] as const // minutes; 0 = never

const SETTINGS_KEY = 'flix.pin'
const LOCKED_KEY = 'flix.locked'

const parseSettings = (raw: unknown): PinSettings | null => {
  const r = raw as Partial<PinSettings> | undefined
  if (!r || typeof r.hash !== 'string' || typeof r.salt !== 'string') return null
  return { hash: r.hash, salt: r.salt, length: r.length ?? 4, idleMinutes: r.idleMinutes ?? 5, lockOnReturn: r.lockOnReturn ?? true }
}

let settings = readStored(SETTINGS_KEY, parseSettings)
let locked = (() => {
  try {
    return !!settings && sessionStorage.getItem(LOCKED_KEY) === '1'
  } catch {
    return false
  }
})()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const usePinSettings = () => useSyncExternalStore(subscribe, () => settings)
export const useLocked = () => useSyncExternalStore(subscribe, () => locked)
export const isLocked = () => locked

export function savePinSettings(next: PinSettings | null) {
  settings = next
  writeStored(SETTINGS_KEY, next ?? undefined)
  if (!next) setLocked(false)
  emit()
}

function setLocked(v: boolean) {
  locked = v
  try {
    if (v) sessionStorage.setItem(LOCKED_KEY, '1')
    else sessionStorage.removeItem(LOCKED_KEY)
  } catch {
    /* storage unavailable: the in-memory flag still holds */
  }
  emit()
}

// Lock now (no PIN set: nothing happens). Every video stops first; nothing resumes on unlock.
export function lock() {
  if (!settings || locked) return
  document.querySelectorAll('video').forEach((v) => v.pause())
  setLocked(true)
}

// True when `pin` is right; the screen then opens.
export function unlock(pin: string): boolean {
  if (!settings) return true
  if (hashPin(pin, settings.salt) !== settings.hash) return false
  setLocked(false)
  return true
}

export const checkPin = (pin: string) => !!settings && hashPin(pin, settings.salt) === settings.hash

export function newPinSettings(pin: string, base?: Pick<PinSettings, 'idleMinutes' | 'lockOnReturn'>): PinSettings {
  const salt = randomSalt()
  return { hash: hashPin(pin, salt), salt, length: pin.length, idleMinutes: base?.idleMinutes ?? 5, lockOnReturn: base?.lockOnReturn ?? true }
}

export const hashPin = (pin: string, salt: string) => sha256Hex(`${salt}:${pin}`)

function randomSalt(): string {
  const b = new Uint8Array(12)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

// SHA-256 in plain JS: `crypto.subtle` is only there on secure origins, and flix.lan is http.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

export function sha256Hex(text: string): string {
  const msg = new TextEncoder().encode(text)
  const len = msg.length
  const words = new Uint32Array((((len + 9 + 63) >> 6) << 4))
  for (let i = 0; i < len; i++) words[i >> 2] |= msg[i] << (24 - (i % 4) * 8)
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8)
  words[words.length - 1] = len * 8
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let off = 0; off < words.length; off += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[off + i]
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] += a
    h[1] += b
    h[2] += c
    h[3] += d
    h[4] += e
    h[5] += f
    h[6] += g
    h[7] += hh
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('')
}
