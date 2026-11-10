// What the video page's Player and the station player share: attaching a source (direct or
// HLS), telling Stash what was watched, the keyboard guard, marker jumps and the flash label.
import type { Marker } from '@flix/shared'
import type Hls from 'hls.js'
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { addPlay, saveActivity } from './api'
import { isPrivate } from './privacy'

export const COUNT_PLAY_AFTER = 20 // seconds watched before a video counts as played
const SAVE_EVERY = 15 // seconds of playback between activity saves
const FINISHED_AT = 0.95 // past this share of the video it counts as finished: no resume point
const RESUME_AFTER = 30 // seconds in before a resume point is kept

const isHls = (src: string) => /\.m3u8(\?|$)/.test(src)

// Point the element at `src`, through hls.js when the browser cannot play HLS itself (anything
// but Safari). Returns the teardown; call it before attaching the next source. A fatal hls.js
// error (the playlist 404s, no segment ever arrives) is raised as the element's own `error`
// event, so both players handle a failed source in one place, their `onError`; until 2026-10-31
// it only ever showed as a spinner that never stopped.
export function attachSource(v: HTMLVideoElement, src: string, startAt: number | null): () => void {
  let hls: Hls | null = null
  let cancelled = false
  if (!isHls(src) || v.canPlayType('application/vnd.apple.mpegurl')) {
    v.src = src
  } else {
    import('hls.js').then(({ default: H }) => {
      if (cancelled) return
      hls = new H({ maxBufferLength: 30, startPosition: startAt ?? -1 })
      hls.on(H.Events.ERROR, (_e, data) => {
        if (!data.fatal || cancelled) return
        hls?.destroy()
        hls = null
        v.dispatchEvent(new Event('error'))
      })
      hls.loadSource(src)
      hls.attachMedia(v)
    })
  }
  return () => {
    cancelled = true
    hls?.destroy()
    hls = null
  }
}

// The marker after (dir 1) or before (dir -1) time `t`, with a little slack so repeated
// presses keep moving.
export function nextMarker(markers: Marker[], t: number, dir: 1 | -1): Marker | undefined {
  return dir > 0 ? markers.find((m) => m.seconds > t + 1) : [...markers].reverse().find((m) => m.seconds < t - 2)
}

// One tick on the seek bar: the markers within 1% of the duration of each other, so a cluster
// of O presses reads as one tick with a count rather than a smear. `o` when every one of them
// is an O-counter mark (the player titles those 'O'); those draw thinner than a named marker.
export interface Tick {
  t: number
  markers: Marker[]
  o: boolean
}

export function groupMarkers(markers: Marker[], dur: number): Tick[] {
  const near = (dur || 1) * 0.01
  const ticks: Tick[] = []
  for (const m of [...markers].sort((a, b) => a.seconds - b.seconds)) {
    const last = ticks.at(-1)
    if (last && m.seconds - last.markers[0].seconds < near) {
      last.markers.push(m)
      last.o &&= m.title === 'O'
    } else ticks.push({ t: m.seconds, markers: [m], o: m.title === 'O' })
  }
  return ticks
}

// What the hover card says about a tick: the marker's title and tag, or how many there are.
export function tickLabel({ markers }: Tick): string {
  if (markers.length > 1) return `${markers.length} markers`
  const [m] = markers
  return m.title && m.tag && m.title !== m.tag ? `${m.title} · ${m.tag}` : m.title || m.tag || 'Marker'
}

// Seconds watched, from the element's own clock: a jump of more than two seconds is a seek
// and does not count. After COUNT_PLAY_AFTER seconds the scene counts as played; every
// SAVE_EVERY seconds, on pause, on leaving and on tab close the time and resume point go to
// Stash. `resume: false` (a station's Moments mode) records nothing: sampling is not watching,
// and neither does a private session (lib/privacy.ts).
export function useWatchAccounting(video: RefObject<HTMLVideoElement | null>, sceneId: string | undefined, { resume = true } = {}) {
  const opts = useRef({ sceneId, resume })
  useLayoutEffect(() => {
    opts.current = { sceneId, resume }
  })
  // One set of stable functions over one mutable record; nothing here re-renders anything.
  const [acct] = useState(() => {
    const s = { id: sceneId, last: null as number | null, watched: 0, unsaved: 0, counted: false }
    const flush = () => {
      const v = video.current
      if (isPrivate()) s.unsaved = 0 // watched in private: forgotten, not saved later
      if (!v || !s.id || !opts.current.resume || s.unsaved < 1) return
      // No resume point once it is all but over (end credits) or before it has really begun:
      // either way it would only sit in Continue watching.
      const t = v.currentTime
      const finished = v.duration && (t > v.duration - 15 || t > v.duration * FINISHED_AT)
      saveActivity(s.id, finished || t < RESUME_AFTER ? 0 : t, s.unsaved).catch(() => {})
      s.unsaved = 0
    }
    const onTimeUpdate = () => {
      const v = video.current
      if (!v || !s.id) return
      const t = v.currentTime
      if (!v.paused && s.last !== null && t > s.last && t - s.last < 2) {
        const d = t - s.last
        s.watched += d
        s.unsaved += d
        if (opts.current.resume && !s.counted && s.watched >= COUNT_PLAY_AFTER && !isPrivate()) {
          s.counted = true
          addPlay(s.id).catch(() => {})
        }
        if (s.unsaved >= SAVE_EVERY) flush()
      }
      s.last = t
    }
    // a new scene: save what the last one had, start counting afresh
    const reset = (id: string | undefined) => {
      if (s.id === id) return
      flush()
      Object.assign(s, { id, last: null, watched: 0, unsaved: 0, counted: false })
    }
    // seconds of the current scene watched so far (stall detection waits for a few)
    const watched = () => s.watched
    return { flush, onTimeUpdate, reset, watched }
  })

  useEffect(() => acct.reset(sceneId), [acct, sceneId])

  useEffect(() => {
    // iOS often skips pagehide when the app is swiped away; hidden is the last event it does send
    const onHide = () => document.visibilityState === 'hidden' && acct.flush()
    addEventListener('pagehide', acct.flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      removeEventListener('pagehide', acct.flush)
      document.removeEventListener('visibilitychange', onHide)
      acct.flush()
    }
  }, [acct])

  return acct
}

// A short label over the picture ("+10s", "Marked"), gone again after a moment.
export function useFlash(): [string | null, (s: string) => void] {
  const [flash, setFlash] = useState<string | null>(null)
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 600)
    return () => clearTimeout(t)
  }, [flash])
  return [flash, setFlash]
}

// Player shortcuts: `handle` returns true for a key it used, which is then not passed on.
// Keys typed into a field, or with a modifier, never reach it. Bound once; the handler may
// close over anything, the latest one is always called. `enabled` false unbinds (a docked
// mini-player leaves the keys to the page being browsed).
export function usePlayerKeys(handle: (e: KeyboardEvent) => boolean | void, enabled = true) {
  const latest = useRef(handle)
  useLayoutEffect(() => {
    latest.current = handle
  })
  useEffect(() => {
    if (!enabled) return
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (latest.current(e)) e.preventDefault()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [enabled])
}

// Where playback is, outside React state. `timeupdate` fires about four times a second; held
// as state in the Player or the station page it re-rendered the whole player, its menu and
// its markers each time. The store changes on every tick, but only the components that
// subscribe (the seek bar, the time readout, the mini progress line) re-render.
export interface ClockValue {
  time: number
  buffered: number // end of the buffered range, seconds
}
export interface Clock {
  get(): ClockValue
  set(time: number, buffered?: number): void
  subscribe(l: () => void): () => void
}
export function createClock(): Clock {
  let value: ClockValue = { time: 0, buffered: 0 }
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(time, buffered = value.buffered) {
      if (time === value.time && buffered === value.buffered) return
      value = { time, buffered }
      listeners.forEach((l) => l())
    },
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}
export const useClock = (clock: Clock): ClockValue => useSyncExternalStore(clock.subscribe, clock.get, clock.get)
// Renders something from the current time, re-rendering only itself as it ticks.
export function At({ clock, children }: { clock: Clock; children: (time: number) => ReactNode }) {
  return children(useClock(clock).time)
}
// Resolves once playback passes `seconds` (for a one-time hint).
export function usePassed(clock: Clock, seconds: number, enabled = true): boolean {
  const [passed, setPassed] = useState(false)
  useEffect(() => {
    if (!enabled || passed) return
    const check = () => clock.get().time > seconds && setPassed(true)
    check()
    return clock.subscribe(check)
  }, [clock, seconds, enabled, passed])
  return passed
}
