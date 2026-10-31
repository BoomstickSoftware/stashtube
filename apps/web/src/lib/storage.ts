// The one place that touches localStorage. It can be missing or throw (private mode, blocked
// site data), so every read falls back to a default and every write is best effort. Values are
// JSON; a value written before this existed (a bare "auto" or "1") comes back as that string.
import { useCallback, useEffect, useRef, useState } from 'react'

export function readStored<T>(key: string, parse: (raw: unknown) => T): T {
  try {
    const s = localStorage.getItem(key)
    if (s === null) return parse(undefined)
    try {
      return parse(JSON.parse(s))
    } catch {
      return parse(s)
    }
  } catch {
    return parse(undefined)
  }
}

// Every write is announced on `window`, so two components holding the same key (the header's
// eye and Settings → Privacy → Discreet) stay in step without a store of their own.
const CHANGED = 'flix:stored'

export function writeStored(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
  // after the current render: a write can come from inside a state updater
  queueMicrotask(() => window.dispatchEvent(new CustomEvent(CHANGED, { detail: key })))
}

// State that survives reloads: `parse` turns whatever is stored (or nothing) into a value.
// Another `useStored` of the same key, anywhere on the page, sees a change at once.
export function useStored<T>(key: string, parse: (raw: unknown) => T): [T, (v: T | ((prev: T) => T)) => void] {
  const [v, setV] = useState(() => readStored(key, parse))
  const parser = useRef(parse) // callers pass a fresh closure each render; the first one is kept
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setV((prev) => {
        const n = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next
        writeStored(key, n)
        return n
      }),
    [key],
  )
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) setV(readStored(key, parser.current))
    }
    window.addEventListener(CHANGED, h)
    return () => window.removeEventListener(CHANGED, h)
  }, [key])
  return [v, set]
}

// Common parsers
export const asBool = (fallback: boolean) => (raw: unknown) => (raw === undefined ? fallback : raw === true || raw === 1 || raw === '1')
export const asNumber = (fallback: number) => (raw: unknown) => {
  const n = Number(raw)
  return raw === undefined || raw === '' || Number.isNaN(n) ? fallback : n
}
export const oneOf =
  <T extends string>(values: readonly T[], fallback: T) =>
  (raw: unknown): T =>
    values.includes(raw as T) ? (raw as T) : fallback
