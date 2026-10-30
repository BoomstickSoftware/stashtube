import type { FeaturedWeights, SceneCard } from '@flix/shared'

// The Featured engine: every video in the library gets a score from a handful of signals,
// each rank-normalised to 0..1 so a dial means the same thing whatever its unit, times the
// weight the user set for it, plus a seeded random term. The seed comes from the page
// (one per visit), so the order holds while you scroll and changes next time. Pure: the
// pool and the affinities come from stash.ts, this file only ranks.

export type Signal = Exclude<keyof FeaturedWeights, 'surprise'>

export const SIGNALS: Signal[] = ['dormant', 'shelfAge', 'fresh', 'performer', 'tag', 'studio', 'watched', 'marked', 'rated', 'oCount']

export interface Candidate {
  card: SceneCard
  performerIds: string[]
  studioId: string | null
  tagIds: string[]
  favPerformer: boolean
  favStudio: boolean
  favTag: boolean
  markers: number
  rating100: number | null
}

// Per id, how much you have watched a performer / studio / tag (any scale; normalised here).
export interface Affinity {
  performers: Map<string, number>
  studios: Map<string, number>
  tags: Map<string, number>
}

export const NO_AFFINITY: Affinity = { performers: new Map(), studios: new Map(), tags: new Map() }

const MAX_PER_PERFORMER = 2
const MAX_PER_STUDIO = 3

// 0..1 by rank: the share of values strictly below this one, so ties share a value and a
// lone outlier cannot stretch everyone else into a corner.
export function rankNormalize(values: number[]): number[] {
  const n = values.length
  if (n < 2) return values.map(() => 0)
  const sorted = [...values].sort((a, b) => a - b)
  const below = new Map<number, number>()
  for (let i = 0; i < n; i++) if (!below.has(sorted[i]!)) below.set(sorted[i]!, i)
  return values.map((v) => below.get(v)! / (n - 1))
}

// Deterministic 0..1 from a string (FNV-1a, then a xorshift mix).
export function hash01(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 0x100000000
}

const toMs = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN)

// The affinity of the people/studio/tags on a scene: the strongest one, as a share of the
// strongest in the library, and a Stash favourite counts as the strongest.
function affinitySignal(ids: string[], fav: boolean, aff: Map<string, number>): number {
  let max = 0
  for (const v of aff.values()) if (v > max) max = v
  let best = fav ? 1 : 0
  if (max > 0) for (const id of ids) best = Math.max(best, (aff.get(id) ?? 0) / max)
  return best
}

// Raw signal values per candidate, before normalisation.
export function rawSignals(c: Candidate, aff: Affinity, now: number): Record<Signal, number> {
  const created = toMs(c.card.createdAt)
  const played = toMs(c.card.lastPlayedAt)
  const shelf = Number.isNaN(created) ? 0 : Math.max(0, now - created)
  return {
    dormant: Number.isNaN(played) ? shelf : Math.max(0, now - played),
    shelfAge: shelf,
    fresh: -shelf,
    performer: affinitySignal(c.performerIds, c.favPerformer, aff.performers),
    tag: affinitySignal(c.tagIds, c.favTag, aff.tags),
    studio: affinitySignal(c.studioId ? [c.studioId] : [], c.favStudio, aff.studios),
    watched: Math.log1p(c.card.playCount),
    marked: c.markers,
    rated: c.rating100 ?? 0,
    oCount: c.card.oCount,
  }
}

export interface Ranked {
  card: SceneCard
  score: number
  why: string
}

export function rankFeatured(cands: Candidate[], aff: Affinity, weights: FeaturedWeights, seed: string, limit: number, now = Date.now()): Ranked[] {
  if (!cands.length) return []
  const raw = cands.map((c) => rawSignals(c, aff, now))
  const norm = {} as Record<Signal, number[]>
  for (const k of SIGNALS) norm[k] = rankNormalize(raw.map((r) => r[k]))
  const scored = cands.map((c, i) => {
    let score = weights.surprise * hash01(`${c.card.id}:${seed}`)
    for (const k of SIGNALS) score += weights[k] * norm[k][i]!
    return { c, i, score }
  })
  scored.sort((a, b) => b.score - a.score || Number(a.c.card.id) - Number(b.c.card.id))

  // Variety: no performer more than twice, no studio more than three times, in what is shown.
  const perPerformer = new Map<string, number>()
  const perStudio = new Map<string, number>()
  const picked: typeof scored = []
  const skipped: typeof scored = []
  for (const s of scored) {
    if (picked.length >= limit) break
    const over =
      s.c.performerIds.some((p) => (perPerformer.get(p) ?? 0) >= MAX_PER_PERFORMER) || (s.c.studioId && (perStudio.get(s.c.studioId) ?? 0) >= MAX_PER_STUDIO)
    if (over) {
      skipped.push(s)
      continue
    }
    picked.push(s)
    for (const p of s.c.performerIds) perPerformer.set(p, (perPerformer.get(p) ?? 0) + 1)
    if (s.c.studioId) perStudio.set(s.c.studioId, (perStudio.get(s.c.studioId) ?? 0) + 1)
  }
  for (const s of skipped) if (picked.length < limit) picked.push(s)

  return picked.map((s) => ({
    card: s.c.card,
    score: s.score,
    why: explain(s.c, raw[s.i]!, SIGNALS.map((k) => [k, norm[k][s.i]!] as const), weights),
  }))
}

// The one or two signals that did most for this pick, in words. A negative weight "helps"
// when the signal is low (rarely watched, newly added), so each signal's benefit is
// w × value for w > 0 and |w| × (1 − value) for w < 0.
function explain(c: Candidate, raw: Record<Signal, number>, norm: (readonly [Signal, number])[], weights: FeaturedWeights): string {
  const benefits = norm
    .map(([k, v]) => ({ k, b: weights[k] > 0 ? weights[k] * v : -weights[k] * (1 - v), neg: weights[k] < 0 }))
    .filter((x) => x.b > 0.05)
    .sort((a, b) => b.b - a.b)
    .slice(0, 2)
  const parts = benefits.map(({ k, neg }) => phrase(k, neg, c, raw)).filter((p): p is string => !!p)
  if (!parts.length) parts.push(weights.surprise > 0 ? 'luck of the draw' : 'a steady pick')
  const text = parts.join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

// "7 months", "2 years", "12 days".
export function span(ms: number): string {
  const days = Math.round(ms / 86_400_000)
  if (days < 45) return plural(Math.max(days, 1), 'day')
  if (days < 365) return plural(Math.round(days / 30.44), 'month')
  return plural(Math.round(days / 365.25), 'year')
}

function phrase(k: Signal, neg: boolean, c: Candidate, raw: Record<Signal, number>): string | null {
  const stars = c.rating100 != null ? Math.round(c.rating100 / 20) : null
  switch (k) {
    case 'dormant':
      if (neg) return c.card.lastPlayedAt ? 'seen recently' : null
      return c.card.lastPlayedAt ? `not seen in ${span(raw.dormant)}` : c.card.playCount ? 'not seen in a while' : 'never watched'
    case 'shelfAge':
      return neg ? 'added recently' : `added ${span(raw.shelfAge)} ago`
    case 'fresh':
      return neg ? `added ${span(raw.shelfAge)} ago` : 'newly added'
    case 'performer':
      return neg ? 'new faces' : c.favPerformer ? 'favourite performer' : 'a performer you watch'
    case 'tag':
      return neg ? 'different tags' : c.favTag ? 'favourite tag' : 'tags you watch'
    case 'studio':
      return neg ? 'a studio you rarely watch' : c.favStudio ? 'favourite studio' : 'a studio you watch'
    case 'watched':
      if (neg) return c.card.playCount ? `only ${plural(c.card.playCount, 'view')}` : 'never watched'
      return c.card.playCount ? `watched ${c.card.playCount}×` : null
    case 'marked':
      return neg ? 'no markers' : c.markers ? plural(c.markers, 'marker') : null
    case 'rated':
      return neg ? (stars ? `rated ${stars}★` : 'unrated') : stars ? `rated ${stars}★` : null
    case 'oCount':
      return neg ? null : c.card.oCount ? `O ×${c.card.oCount}` : null
  }
  return null
}

// Clamp a user-supplied weights object to the known keys and [-1, 1].
export function sanitizeWeights(w: Partial<Record<keyof FeaturedWeights, unknown>>, defaults: FeaturedWeights): FeaturedWeights {
  const out = { ...defaults }
  for (const k of Object.keys(defaults) as (keyof FeaturedWeights)[]) {
    const v = w[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(-1, Math.min(1, Math.round(v * 100) / 100))
  }
  return out
}
