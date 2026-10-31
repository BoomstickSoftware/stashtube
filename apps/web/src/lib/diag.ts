// What a desktop console would show, kept on the device: script errors, unhandled rejections,
// the router's navigations and where the player is. A phone has no console; Settings →
// Diagnostics lists the last entries and copies them for a bug report. Memory only, this visit.
import type { AnyRouter } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'

export interface Entry {
  at: number
  text: string
}

const MAX = 80
let entries: Entry[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function log(text: string) {
  entries = [...entries.slice(-(MAX - 1)), { at: Date.now(), text }]
  emit()
}

export function clearLog() {
  entries = []
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useDiag = (): Entry[] => useSyncExternalStore(subscribe, () => entries)

const describe = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e))

// Once at start-up: window errors and the router's navigation events.
export function watch(router: AnyRouter) {
  window.addEventListener('error', (e) => log(`error: ${e.message} (${e.filename?.split('/').pop() ?? '?'}:${e.lineno})`))
  window.addEventListener('unhandledrejection', (e) => log(`rejected: ${describe(e.reason)}`))
  router.subscribe('onBeforeNavigate', (e) => log(`navigate → ${e.toLocation.href}`))
  router.subscribe('onResolved', (e) => log(`resolved ${e.toLocation.href}`))
  log(`start ${location.pathname}${location.search}`)
}
