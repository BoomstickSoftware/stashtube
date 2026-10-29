// The one place that touches localStorage. It can be missing or throw (private mode, blocked
// site data), so every read falls back to a default and every write is best effort. Values are
// JSON; a value written before this existed (a bare "auto" or "1") comes back as that string.
import { useCallback, useState } from 'react'

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

export function writeStored(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

// State that survives reloads: `parse` turns whatever is stored (or nothing) into a value.
export function useStored<T>(key: string, parse: (raw: unknown) => T): [T, (v: T | ((prev: T) => T)) => void] {
  const [v, setV] = useState(() => readStored(key, parse))
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setV((prev) => {
        const n = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next
        writeStored(key, n)
        return n
      }),
    [key],
  )
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
