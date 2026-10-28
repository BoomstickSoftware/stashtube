import type { Page, SceneCard, SceneDetail, SceneQuery } from '@flix/shared'
import { get, qs, queryClient } from './api'

// A station: endless play from a filter set (shuffled) or from one scene (drifting through
// related videos). Full mode plays whole videos; Moments plays a window around each marker,
// or around sample points when a video has none, fading between them.

export type StationMode = 'full' | 'moments'
export interface StationPrefs {
  mode: StationMode
  window: number // seconds per moment
}
export const windows = [30, 60, 90] as const

const KEY = 'flix:station'
export function loadPrefs(): StationPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { mode: p.mode === 'moments' ? 'moments' : 'full', window: windows.includes(p.window) ? p.window : 60 }
  } catch {
    return { mode: 'full', window: 60 }
  }
}
export function savePrefs(p: StationPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {}
}

export type StationSearch = SceneQuery & { from?: string }

// The filters a station keeps from a list (its own order is random).
export function stationQuery(q: SceneQuery): SceneQuery {
  const { sort: _s, seed: _d, dir: _r, page: _p, perPage: _n, ...rest } = q
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as SceneQuery
}

export interface Segment {
  start: number
  end: number
}

// Where to play in a scene. Moments: a window around each marker (a third before, two thirds
// after), merged where they overlap, at most six; without markers, windows at 20/40/60/80%.
export function segmentsFor(scene: SceneDetail, prefs: StationPrefs, introSkip = 0): Segment[] {
  const d = scene.durationSec
  if (prefs.mode === 'full' || d < prefs.window * 1.5) return [{ start: Math.min(introSkip, Math.max(0, d - 10)), end: d }]
  const w = prefs.window
  const points = scene.markers.length
    ? scene.markers.map((m) => m.seconds).sort((a, b) => a - b)
    : [0.2, 0.4, 0.6, 0.8].map((f) => f * d)
  const out: Segment[] = []
  for (const p of points) {
    const s = { start: Math.max(introSkip, p - w / 3), end: Math.min(d, p + (w * 2) / 3) }
    const last = out[out.length - 1]
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
    else if (s.end - s.start >= 5) out.push(s)
  }
  return out.slice(0, 6)
}

const detail = (id: string) =>
  queryClient.fetchQuery({ queryKey: ['scene', id], queryFn: () => get<SceneDetail>(`/scenes/${id}`), staleTime: 60_000 })

// Hands out scenes one at a time, never repeating until everything has played.
export class StationQueue {
  private played = new Set<string>()
  private pool: string[] = []
  private page = 1
  private seed = Math.floor(Math.random() * 1e6) + 1
  private last: string | undefined
  private query: SceneQuery
  private from: string | undefined

  constructor(query: SceneQuery, from?: string) {
    this.query = query
    this.from = from
  }

  async next(): Promise<SceneDetail | null> {
    const id = await this.nextId()
    if (!id) return null
    this.played.add(id)
    this.last = id
    return detail(id)
  }

  private async nextId(): Promise<string | undefined> {
    if (this.from) {
      if (!this.last) return this.from
      const related = await queryClient.fetchQuery({
        queryKey: ['related', this.last],
        queryFn: () => get<SceneCard[]>(`/scenes/${this.last}/related`),
        staleTime: 5 * 60_000,
      })
      const fresh = related.find((s) => !this.played.has(s.id))
      if (fresh) return fresh.id
      // drifted into a corner: carry on shuffling the whole library
      this.from = undefined
    }
    for (let tries = 0; tries < 3; tries++) {
      while (this.pool.length) {
        const id = this.pool.shift()!
        if (!this.played.has(id)) return id
      }
      const r = await get<Page<SceneCard>>(`/scenes${qs({ ...this.query, sort: 'random', seed: this.seed, page: this.page, perPage: 40 })}`)
      this.page++
      this.pool = r.items.map((s) => s.id)
      if (!r.items.length) {
        if (!r.total) return undefined
        // played everything: start a new shuffle
        this.played.clear()
        if (this.last) this.played.add(this.last)
        this.seed = Math.floor(Math.random() * 1e6) + 1
        this.page = 1
      }
    }
    return undefined
  }
}
