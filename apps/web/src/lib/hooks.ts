// Small hooks that are not about any one feature.
import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'

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
