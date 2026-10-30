// Small hooks that are not about any one feature.
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'

export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onOutside()
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('keydown', k)
    }
  }, [ref, onOutside, active])
}

// Live result of a CSS media query, e.g. '(pointer: coarse)' for touch screens.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = matchMedia(query)
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    },
    () => matchMedia(query).matches,
  )
}

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// Calls onVisible when the sentinel scrolls near the viewport (infinite scroll).

// A press held still for `ms` on a touch screen. Returns pointer handlers to spread on the
// element and `fired`, a ref the caller reads (and resets) to ignore the tap or click the
// same finger produces when it lifts. A second finger, movement past 10 px or a mouse cancels.
export function useLongPress(onFire: (x: number, y: number) => void, { ms = 500, enabled = true } = {}) {
  const timer = useRef<number>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  const cancel = () => {
    clearTimeout(timer.current)
    timer.current = undefined
    start.current = null
  }
  return {
    fired,
    onPointerDown(e: React.PointerEvent) {
      if (!enabled || e.pointerType === 'mouse') return
      if (timer.current) return cancel() // a second finger
      fired.current = false
      const { clientX: x, clientY: y } = e
      start.current = { x, y }
      timer.current = window.setTimeout(() => {
        timer.current = undefined
        fired.current = true
        onFire(x, y)
      }, ms)
    },
    onPointerMove(e: React.PointerEvent) {
      const s = start.current
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  }
}
