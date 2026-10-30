// The one video playing right now, kept outside the page tree so it survives navigation. The
// scene page does not render the Player itself: it opens its scene here and renders a slot;
// the host in Layout renders the Player once and places it over that slot, or, when the page is
// gone, docks it in a corner as the mini-player. Returning to the scene finds the same video
// still playing.
import type { SceneDetail } from '@flix/shared'
import { useSyncExternalStore } from 'react'
import type { PlayerHandle } from '../components/Player'
import { asBool, readStored } from './storage'

export const KEEP_PLAYING_KEY = 'flix.keepPlaying' // Settings → Playback: dock instead of stopping

// What the scene page asks of the player while it shows it.
export interface Handlers {
  onNext?: () => void
  onEnded?: () => void
  onTheater?: () => void
}

export interface NowPlaying {
  scene: SceneDetail | null
  startAt?: number
  autoStart: boolean
  theater: boolean
  slot: HTMLElement | null // the scene page's placeholder, while that page shows this scene
  handlers: Handlers
}

// Where playback is, for the mini-player's chrome; updated by the Player about once a second.
export interface Status {
  playing: boolean
  time: number
  dur: number
  ended: boolean
}

const IDLE: Status = { playing: false, time: 0, dur: 0, ended: false }
let state: NowPlaying = { scene: null, autoStart: false, theater: false, slot: null, handlers: {} }
let status: Status = IDLE
let handle: PlayerHandle | null = null
const listeners = new Set<() => void>()
const statusListeners = new Set<() => void>()

const set = (patch: Partial<NowPlaying>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const nowPlaying = {
  // The scene page opens its scene. The same scene again (coming back from browsing) changes
  // nothing: the video keeps playing where it is.
  open(scene: SceneDetail, opts: { startAt?: number; autoStart: boolean; theater: boolean }) {
    if (state.scene?.id === scene.id) {
      if (state.theater !== opts.theater) set({ theater: opts.theater })
      return
    }
    status = IDLE
    statusListeners.forEach((l) => l())
    // the slot stays: the new page attached it during its commit, before this effect ran
    set({ scene, startAt: opts.startAt, autoStart: opts.autoStart, theater: opts.theater, handlers: {} })
  },
  attach(slot: HTMLElement | null) {
    if (state.slot !== slot) set({ slot })
  },
  setHandlers(handlers: Handlers) {
    set({ handlers })
  },
  setTheater(theater: boolean) {
    if (state.theater !== theater) set({ theater })
  },
  // The scene page is going away. The video docks if it has been playing and the setting allows
  // it; a video that never started just closes.
  leave(sceneId: string) {
    if (state.scene?.id !== sceneId) return
    const keep = readStored(KEEP_PLAYING_KEY, asBool(true))
    if (!keep || (!status.playing && status.time < 1) || status.ended) nowPlaying.close()
    else set({ slot: null, handlers: {} })
  },
  close() {
    if (!state.scene) return
    status = IDLE
    statusListeners.forEach((l) => l())
    set({ scene: null, slot: null, handlers: {}, startAt: undefined })
  },
  // the Player's handle, for the page's chapter chips and the O button
  setHandle(h: PlayerHandle | null) {
    handle = h
  },
  seek: (t: number) => handle?.seek(t),
  time: () => handle?.time() ?? 0,
  toggle: () => handle?.toggle(),
  report(s: Status) {
    if (s.playing === status.playing && s.ended === status.ended && Math.abs(s.time - status.time) < 0.5 && s.dur === status.dur) return
    status = s
    statusListeners.forEach((l) => l())
  },
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const subscribeStatus = (l: () => void) => {
  statusListeners.add(l)
  return () => statusListeners.delete(l)
}

export const useNowPlaying = (): NowPlaying => useSyncExternalStore(subscribe, () => state)
export const useNowPlayingStatus = (): Status => useSyncExternalStore(subscribeStatus, () => status)
