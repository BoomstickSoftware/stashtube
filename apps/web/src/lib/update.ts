// Keeps an open flix on the build the server runs. An installed app on an iPhone is resumed
// from memory rather than reloaded, so without this it keeps the old code until iOS evicts it.
//
// - Coming back to the foreground, it asks /healthz for the server's build and reloads when
//   that differs from the build this page came with (the server writes it into the page).
// - A lazy chunk that fails to load means this build is gone from the server: reload.
//
// It must never loop. A reload is attempted at most RELOAD_TRIES times per target build and
// never within RELOAD_GAP of the last one, both remembered in localStorage; when storage cannot
// be written there is no automatic reload at all. Nothing reloads while a video plays (the
// next return to the foreground checks again), and a dev server has no build to compare.
import { readStored, writeStored } from './storage'

const BUILD = document.querySelector<HTMLMetaElement>('meta[name="flix-version"]')?.content
const KEY = 'flix.reloads'
const RELOAD_TRIES = 2 // per target build: a rollout still in progress may serve the old page once
const RELOAD_GAP = 30_000 // ms between automatic reloads, whatever the target
const KEEP = 10 // targets remembered

type Attempts = { at: number; tries: Record<string, number> }
const parse = (raw: unknown): Attempts => {
  const a = raw as Partial<Attempts> | undefined
  return { at: typeof a?.at === 'number' ? a.at : 0, tries: a?.tries && typeof a.tries === 'object' ? a.tries : {} }
}

// Reloads towards `target` if the limits allow; true when the page is reloading.
function reload(target: string): boolean {
  const a = readStored(KEY, parse)
  const now = Date.now()
  const tries = a.tries[target] ?? 0
  if (tries >= RELOAD_TRIES || Math.abs(now - a.at) < RELOAD_GAP) return false
  const next: Attempts = { at: now, tries: Object.fromEntries([...Object.entries(a.tries).filter(([k]) => k !== target), [target, tries + 1]].slice(-KEEP)) }
  writeStored(KEY, next)
  // only reload once the attempt is on record, or a page that cannot store it could loop
  if (readStored(KEY, parse).at !== now) return false
  location.reload()
  return true
}

const playing = () => [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended)

async function check() {
  if (playing()) return
  try {
    const r = await fetch('/healthz', { cache: 'no-store' })
    const { version } = (await r.json()) as { version?: unknown }
    if (typeof version === 'string' && version !== 'dev' && version !== BUILD && !playing()) reload(version)
  } catch {
    /* offline or restarting: try again next time */
  }
}

// A deliberate check (pull to refresh): 'current', 'reloading', or 'waiting' when a newer build
// is on the server but a video is playing, or the reload limits said no. The caller offers
// `updateNow` then.
export async function checkForUpdate(): Promise<'current' | 'reloading' | 'waiting'> {
  if (!BUILD || BUILD === 'dev') return 'current'
  try {
    const r = await fetch('/healthz', { cache: 'no-store' })
    const { version } = (await r.json()) as { version?: unknown }
    if (typeof version !== 'string' || version === 'dev' || version === BUILD) return 'current'
    return !playing() && reload(version) ? 'reloading' : 'waiting'
  } catch {
    return 'current'
  }
}
// The user asked for it: no limits apply.
export const updateNow = () => location.reload()

export function keepCurrent() {
  if (!BUILD || BUILD === 'dev') return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  // Vite's event for a dynamic import that failed; preventDefault stops it throwing, so only
  // when the page is about to reload (otherwise the route's error shows as it would have).
  window.addEventListener('vite:preloadError', (e) => {
    if (reload(`missing:${BUILD}`)) e.preventDefault()
  })
}
