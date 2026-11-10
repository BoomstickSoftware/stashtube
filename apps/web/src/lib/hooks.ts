// Small hooks that are not about any one feature.
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject, type TouchEvent as ReactTouchEvent } from 'react'

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

// What every modal surface needs (a sheet, a dialog): Esc closes it, the page behind does not
// scroll, focus moves into it and returns to what opened it. Pass the panel's ref.
let locks = 0
export function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    addEventListener('keydown', k)
    if (locks++ === 0) document.documentElement.style.overflow = 'hidden'
    const panel = ref.current
    // an autofocus field inside keeps its focus; otherwise the panel itself takes it
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    return () => {
      removeEventListener('keydown', k)
      if (--locks === 0) document.documentElement.style.overflow = ''
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [ref])
}

// Drag a bottom sheet down by its header to dismiss it: the panel follows the finger 1:1, and on
// release either leaves (past a third of its height, or flicked) or settles back. Spread the
// returned handlers on the header; touch only, a mouse has the scrim and Esc.
export function useSheetDrag(panel: RefObject<HTMLElement | null>, onClose: () => void) {
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null)
  const move = (dy: number, animate: boolean) => {
    const el = panel.current
    if (!el) return
    el.style.setProperty('animation', 'none') // the entrance is over; without this it would replay on release
    el.style.setProperty('transition', animate ? 'transform 0.2s var(--ease-standard)' : 'none')
    el.style.setProperty('transform', dy ? `translateY(${dy}px)` : '')
  }
  return {
    onTouchStart: (e: ReactTouchEvent) => {
      drag.current = { y: e.touches[0].clientY, t: e.timeStamp, dy: 0 }
    },
    onTouchMove: (e: ReactTouchEvent) => {
      const d = drag.current
      if (!d) return
      d.dy = Math.max(0, e.touches[0].clientY - d.y)
      move(d.dy, false)
    },
    onTouchEnd: (e: ReactTouchEvent) => {
      const d = drag.current
      drag.current = null
      if (!d) return
      const h = panel.current?.offsetHeight ?? 300
      const flick = d.dy > 24 && d.dy / Math.max(1, e.timeStamp - d.t) > 0.5 // px per ms
      if (d.dy > h / 3 || flick) {
        move(h, true)
        setTimeout(onClose, 180)
      } else move(0, true)
    },
  }
}
