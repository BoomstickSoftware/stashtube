import { type ReactNode, useSyncExternalStore } from 'react'

// One toast at a time, shown by <Toaster> (components/ui). `action` is rendered as is, e.g. a Link.
type Toast = { id: number; text: ReactNode; action?: ReactNode }
let toast: Toast | null = null
let toastTimer: number | undefined
const toastListeners = new Set<() => void>()
const emitToast = () => toastListeners.forEach((l) => l())

export function showToast(text: ReactNode, action?: ReactNode, ms = 4000) {
  toast = { id: (toast?.id ?? 0) + 1, text, action }
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast = null
    emitToast()
  }, ms)
  emitToast()
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (l) => {
      toastListeners.add(l)
      return () => toastListeners.delete(l)
    },
    () => toast,
  )
}
