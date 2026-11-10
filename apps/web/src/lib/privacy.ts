// Private session: for the rest of this visit flix records nothing about what is watched. It
// lives in sessionStorage, so it survives route changes and a reload but ends when the tab or
// the installed app is closed; opening flix again starts a normal session.
//
// What it stops: plays and play time, resume points, "Mark as watched", ratings, the O counter
// and markers dropped from the player, and where a station is left. Deliberate library acts
// (favourites, playlists, unlisting, deletes, metadata edits) still go through: they are
// curation, not a trace of this viewing.
import { useSyncExternalStore } from 'react'
import { showToast } from './toast'

const KEY = 'flix.private'

const read = (): boolean => {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let on = read()
const listeners = new Set<() => void>()

export const isPrivate = () => on

export function setPrivate(v: boolean) {
  on = v
  try {
    if (v) sessionStorage.setItem(KEY, '1')
    else sessionStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: the in-memory flag still holds for this page */
  }
  listeners.forEach((l) => l())
}

export function useIsPrivate(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => on,
  )
}

// Run a write that would leave a trace, unless the session is private: then say so instead.
// Returns whether it ran. Writes that happen on their own (play accounting) check `isPrivate()`
// directly and stay quiet.
export function guardWrite(write: () => void): boolean {
  if (on) {
    showToast('Private session: nothing is recorded')
    return false
  }
  write()
  return true
}
