import { type ReactNode, useSyncExternalStore } from 'react'

// Up to three toasts, newest at the bottom, shown by <Toaster> (components/ui). `action` is
// rendered as is (an Undo button, a Link). A second toast no longer replaces the first: its Undo
// stays reachable until its own time is up.
export type Toast = { id: number; text: ReactNode; action?: ReactNode }
const MAX = 3
let toasts: readonly Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function dismissToast(id: number) {
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function showToast(text: ReactNode, action?: ReactNode, ms = 4000) {
  const id = nextId++
  toasts = [...toasts, { id, text, action }].slice(-MAX)
  window.setTimeout(() => dismissToast(id), ms)
  emit()
}

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
}
