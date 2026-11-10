// "Play next": videos lined up from a card's menu while something is playing. They play, in
// order, before the playlist or Related list continues; on the video's page that is the Up next
// list, and a docked mini-player moves on to them by itself. Held for this visit only
// (sessionStorage), like the player it feeds.
import type { SceneCard } from '@flix/shared'
import { useSyncExternalStore } from 'react'

const KEY = 'flix.upNext'
const MAX = 20

const read = (): SceneCard[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((s) => s && typeof s.id === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

let list: SceneCard[] = read()
const listeners = new Set<() => void>()
const set = (next: SceneCard[]) => {
  list = next
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable: the list still holds for this page */
  }
  listeners.forEach((l) => l())
}

// first in line, ahead of anything queued earlier; one entry per video
export const queuedFirst = (queue: SceneCard[], scene: SceneCard): SceneCard[] => [scene, ...queue.filter((s) => s.id !== scene.id)].slice(0, MAX)
// the queued videos, then the rest of a list without them or the current video
export const withQueued = (queued: SceneCard[], rest: SceneCard[], current: string): SceneCard[] => {
  const q = queued.filter((s) => s.id !== current)
  const ids = new Set(q.map((s) => s.id))
  return [...q, ...rest.filter((s) => !ids.has(s.id) && s.id !== current)]
}

export const upNext = {
  list: () => list,
  has: (id: string) => list.some((s) => s.id === id),
  playNext: (scene: SceneCard) => set(queuedFirst(list, scene)),
  remove: (id: string) => {
    if (list.some((s) => s.id === id)) set(list.filter((s) => s.id !== id))
  },
}

export const useUpNext = (): SceneCard[] =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => list,
  )
