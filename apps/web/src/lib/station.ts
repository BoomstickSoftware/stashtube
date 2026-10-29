import type { Page, PlaylistDetail, SceneCard, SceneDetail, SceneQuery, StationMode } from '@flix/shared'
import { get, qs, queryClient } from './api'
import { readStored, writeStored } from './storage'

// A station: endless play from a filter set (shuffled) or from one scene (drifting through
// related videos). Full mode plays whole videos; Moments plays a window around each marker,
// or around sample points when a video has none, fading between them.

export type { StationMode }
export interface StationPrefs {
  mode: StationMode
  window: number // seconds per moment
}
export const windows = [30, 60, 90] as const

const KEY = 'flix:station'
export const loadPrefs = (): StationPrefs =>
  readStored(KEY, (raw) => {
    const p = (raw ?? {}) as Partial<StationPrefs>
    return { mode: p.mode === 'moments' ? 'moments' : 'full', window: (windows as readonly number[]).includes(p.window!) ? p.window! : 60 }
  })
export const savePrefs = (p: StationPrefs) => writeStored(KEY, p)

// start=resume: pick up where the station was left (otherwise a fresh shuffle). playlist=<id>
// plays a playlist in its order.
export type StationSearch = SceneQuery & { from?: string; id?: number; playlist?: number; start?: 'resume' }

// The /station search that reopens the station a resume key belongs to (the inverse of stationKey).
export function stationSearchFor(key: string): StationSearch {
  if (key.startsWith('id:')) return { id: Number(key.slice(3)) }
  if (key.startsWith('from:')) return { from: key.slice(5) }
  if (key.startsWith('pl:')) return { playlist: Number(key.slice(3)) }
  try {
    return JSON.parse(key.slice(2)) as SceneQuery
  } catch {
    return {}
  }
}

// The key a station's resume point is saved under.
export function stationKey(c: { id?: number; query: SceneQuery; from?: string; playlist?: number }): string {
  if (c.id) return `id:${c.id}`
  if (c.from) return `from:${c.from}`
  if (c.playlist) return `pl:${c.playlist}`
  const q = stationQuery(c.query)
  return `q:${JSON.stringify(Object.fromEntries(Object.entries(q).sort(([a], [b]) => a.localeCompare(b))))}`
}

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

// The plan from a point the viewer chose (a seek, a resume): a moment starting there, then the
// planned ones after it.
export function segmentsFrom(scene: SceneDetail, prefs: StationPrefs, t: number, introSkip = 0): Segment[] {
  const d = scene.durationSec
  if (prefs.mode === 'full') return [{ start: t, end: d }]
  const cur = { start: t, end: Math.min(d, t + (prefs.window * 2) / 3) }
  const out = [cur]
  for (const s of segmentsFor(scene, prefs, introSkip)) {
    if (s.end <= t) continue
    const last = out[out.length - 1]!
    if (s.start <= last.end) last.end = Math.max(last.end, s.end)
    else out.push({ ...s })
  }
  return out
}

const detail = (id: string) =>
  queryClient.fetchQuery({ queryKey: ['scene', id], queryFn: () => get<SceneDetail>(`/scenes/${id}`), staleTime: 60_000 })

// Hands out scenes one at a time, never repeating until everything has played. Keeps what
// has played (to go back, or pick again from the list) and what is coming up. A playlist
// station plays the list in its order, then starts over.
export class StationQueue {
  private played = new Set<string>()
  private pool: SceneCard[] = []
  private page = 1
  private seed = Math.floor(Math.random() * 1e6) + 1
  private last: string | undefined
  private query: SceneQuery
  private from: string | undefined
  private playlist: number | undefined
  private exhausted = false // this shuffle has handed out its last page
  history: SceneCard[] = [] // in play order; the last one is playing
  private pos = -1 // where in history the player is (back moves it)

  constructor(query: SceneQuery, from?: string, playlist?: number) {
    this.query = query
    this.from = from
    this.playlist = playlist
  }

  get current(): SceneCard | undefined {
    return this.history[this.pos]
  }
  get canGoBack() {
    return this.pos > 0
  }

  async next(): Promise<SceneDetail | null> {
    // after going back, forward walks history again first
    if (this.pos < this.history.length - 1) return this.open(this.history[++this.pos]!.id)
    const id = await this.nextId()
    return id ? this.take(id) : null
  }

  async back(): Promise<SceneDetail | null> {
    if (!this.canGoBack) return null
    return this.open(this.history[--this.pos]!.id)
  }

  // Play a scene now: one from the up-next list, from history, or a resume point.
  async jump(id: string): Promise<SceneDetail> {
    const at = this.history.findIndex((s) => s.id === id)
    if (at >= 0) {
      this.pos = at
      return this.open(id)
    }
    this.pool = this.pool.filter((s) => s.id !== id)
    return this.take(id)
  }

  // The next `n` scenes, loading more of the shuffle when needed. Drifting: the current
  // video's related ones that have not played.
  async upcoming(n: number): Promise<SceneCard[]> {
    const later = this.history.slice(this.pos + 1)
    if (this.from) {
      if (!this.last) return later
      const related = await this.related(this.last)
      return [...later, ...related.filter(this.fresh)].slice(0, n)
    }
    while (later.length + this.pool.length < n && !this.exhausted && (await this.fill())) {}
    return [...later, ...this.pool.filter((s) => !this.played.has(s.id))].slice(0, n)
  }

  private async take(id: string): Promise<SceneDetail> {
    const s = await detail(id)
    this.played.add(id)
    this.last = id
    this.history = [...this.history.slice(0, this.pos + 1), s]
    this.pos = this.history.length - 1
    return s
  }

  private async open(id: string): Promise<SceneDetail> {
    this.last = id
    return detail(id)
  }

  // Not played on this station (and, for an unwatched station, never watched at all).
  private fresh = (s: SceneCard) => !this.played.has(s.id) && !(this.query.unwatched && s.playCount > 0)

  private related(id: string) {
    return queryClient.fetchQuery({
      queryKey: ['related', id],
      queryFn: () => get<SceneCard[]>(`/scenes/${id}/related`),
      staleTime: 5 * 60_000,
    })
  }

  // One more page of the shuffle (a playlist comes whole, in order); false when there is
  // nothing more to add.
  private async fill(): Promise<boolean> {
    if (this.playlist) {
      const p = await queryClient.fetchQuery({ queryKey: ['playlist', this.playlist], queryFn: () => get<PlaylistDetail>(`/playlists/${this.playlist}`), staleTime: 60_000 })
      this.pool.push(...p.items.filter((s) => !this.played.has(s.id)))
      this.exhausted = true
      return p.items.length > 0
    }
    const r = await get<Page<SceneCard>>(`/scenes${qs({ ...this.query, sort: 'random', seed: this.seed, page: this.page, perPage: 40 })}`)
    this.page++
    const known = new Set(this.pool.map((s) => s.id))
    this.pool.push(...r.items.filter((s) => !known.has(s.id)))
    if (!r.items.length || r.page * r.perPage >= r.total) this.exhausted = true
    return r.items.length > 0
  }

  private async nextId(): Promise<string | undefined> {
    if (this.from) {
      if (!this.last) return this.from
      const fresh = (await this.related(this.last)).find(this.fresh)
      if (fresh) return fresh.id
      // drifted into a corner: carry on shuffling the whole library
      this.from = undefined
    }
    for (let tries = 0; tries < 3; tries++) {
      while (this.pool.length) {
        const s = this.pool.shift()!
        if (!this.played.has(s.id)) return s.id
      }
      if (!this.exhausted && (await this.fill())) continue
      if (!this.played.size && this.exhausted) return undefined
      // played everything: start a new shuffle
      this.played.clear()
      if (this.last) this.played.add(this.last)
      this.seed = Math.floor(Math.random() * 1e6) + 1
      this.page = 1
      this.exhausted = false
    }
    return undefined
  }
}
