// The Featured engine's ranking: rank normalisation, seeded determinism, the variety cap,
// negative weights, and the "why" line.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FeaturedWeights, SceneCard } from '@flix/shared'
import { type Candidate, FEATURED_DEFAULTS, hash01, NO_AFFINITY, rankFeatured, rankNormalize, sanitizeWeights, span } from './featured.ts'

const NOW = Date.parse('2026-10-30T00:00:00Z')
const day = 86_400_000

const ZERO: FeaturedWeights = { dormant: 0, shelfAge: 0, fresh: 0, performer: 0, tag: 0, studio: 0, watched: 0, marked: 0, rated: 0, oCount: 0, surprise: 0 }

function cand(id: string, o: Partial<SceneCard> & Partial<Omit<Candidate, 'card'>> = {}): Candidate {
  const { performerIds, studioId, tagIds, favPerformer, favStudio, favTag, markers, rating100, ...card } = o
  return {
    card: {
      id,
      title: `Scene ${id}`,
      date: null,
      durationSec: 600,
      width: 1920,
      height: 1080,
      size: 1,
      rating: null,
      playCount: 0,
      oCount: 0,
      resumeTime: 0,
      lastPlayedAt: null,
      createdAt: new Date(NOW - 100 * day).toISOString(),
      studio: null,
      performers: [],
      screenshot: '',
      preview: null,
      vtt: null,
      ...card,
    },
    performerIds: performerIds ?? [],
    studioId: studioId ?? null,
    tagIds: tagIds ?? [],
    favPerformer: favPerformer ?? false,
    favStudio: favStudio ?? false,
    favTag: favTag ?? false,
    markers: markers ?? 0,
    rating100: rating100 ?? null,
  }
}

const ids = (r: { card: SceneCard }[]) => r.map((x) => x.card.id)

describe('rankNormalize', () => {
  it('maps by rank, ties share a value, outliers do not stretch the rest', () => {
    assert.deepEqual(rankNormalize([10, 20, 20, 1_000_000]), [0, 1 / 3, 1 / 3, 1])
    assert.deepEqual(rankNormalize([5]), [0])
    assert.deepEqual(rankNormalize([]), [])
  })
})

describe('hash01', () => {
  it('is deterministic and spread over 0..1', () => {
    assert.equal(hash01('217:abc'), hash01('217:abc'))
    assert.notEqual(hash01('217:abc'), hash01('217:abd'))
    const xs = Array.from({ length: 1000 }, (_, i) => hash01(`${i}:seed`))
    assert.ok(xs.every((x) => x >= 0 && x < 1))
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    assert.ok(Math.abs(mean - 0.5) < 0.05, `mean ${mean}`)
  })
})

describe('rankFeatured', () => {
  const pool = [
    cand('1', { playCount: 9, lastPlayedAt: new Date(NOW - 2 * day).toISOString() }),
    cand('2', { playCount: 1, lastPlayedAt: new Date(NOW - 200 * day).toISOString() }),
    cand('3', { createdAt: new Date(NOW - 800 * day).toISOString() }),
    cand('4', { createdAt: new Date(NOW - 1 * day).toISOString() }),
  ]

  it('orders by a single positive weight, and inverts it when negative', () => {
    const most = rankFeatured(pool, NO_AFFINITY, { ...ZERO, watched: 1 }, 's', 10, NOW)
    assert.deepEqual(ids(most).slice(0, 2), ['1', '2'])
    assert.equal(most[0]!.why, 'Watched 9×')
    const least = rankFeatured(pool, NO_AFFINITY, { ...ZERO, watched: -1 }, 's', 10, NOW)
    assert.deepEqual(ids(least).slice(-1), ['1'])
    assert.equal(least[0]!.why, 'Never watched')
  })

  it('reads dormancy from the last play, or from the add date when never played', () => {
    const r = rankFeatured(pool, NO_AFFINITY, { ...ZERO, dormant: 1 }, 's', 10, NOW)
    assert.deepEqual(ids(r), ['3', '2', '1', '4'])
    assert.equal(r[0]!.why, 'Never watched')
    assert.equal(r[1]!.why, 'Not seen in 7 months')
  })

  it('is deterministic for a seed and different for another', () => {
    const big = Array.from({ length: 40 }, (_, i) => cand(String(i)))
    const a = rankFeatured(big, NO_AFFINITY, { ...ZERO, surprise: 1 }, 'one', 10, NOW)
    const b = rankFeatured(big, NO_AFFINITY, { ...ZERO, surprise: 1 }, 'one', 10, NOW)
    const c = rankFeatured(big, NO_AFFINITY, { ...ZERO, surprise: 1 }, 'two', 10, NOW)
    assert.deepEqual(ids(a), ids(b))
    assert.notDeepEqual(ids(a), ids(c))
    assert.equal(a[0]!.why, 'Luck of the draw')
  })

  it('caps a performer at two and a studio at three, then backfills', () => {
    const same = Array.from({ length: 6 }, (_, i) => cand(`p${i}`, { performerIds: ['9'], rating100: 100 - i }))
    const others = Array.from({ length: 2 }, (_, i) => cand(`o${i}`, { rating100: 50 }))
    const r = rankFeatured([...same, ...others], NO_AFFINITY, { ...ZERO, rated: 1 }, 's', 5, NOW)
    assert.deepEqual(ids(r), ['p0', 'p1', 'o0', 'o1', 'p2'])
    const studios = Array.from({ length: 5 }, (_, i) => cand(`s${i}`, { studioId: '7', rating100: 90 - i }))
    const r2 = rankFeatured([...studios, cand('x', { rating100: 10 })], NO_AFFINITY, { ...ZERO, rated: 1 }, 's', 4, NOW)
    assert.deepEqual(ids(r2), ['s0', 's1', 's2', 'x'])
  })

  it('weighs favourites and watched people, and says so', () => {
    const aff = { performers: new Map([['9', 40]]), studios: new Map<string, number>(), tags: new Map([['t', 3]]) }
    const r = rankFeatured(
      [cand('a', { performerIds: ['9'] }), cand('b', { performerIds: ['1'], favPerformer: true }), cand('c', { tagIds: ['t'] }), cand('d')],
      aff,
      { ...ZERO, performer: 1, tag: 0.5 },
      's',
      10,
      NOW,
    )
    assert.deepEqual(ids(r).slice(0, 2).sort(), ['a', 'b'])
    assert.equal(r.find((x) => x.card.id === 'b')!.why, 'A performer you follow')
    assert.equal(r.find((x) => x.card.id === 'a')!.why, 'A performer you watch')
    assert.equal(r.find((x) => x.card.id === 'c')!.why, 'Categories you watch')
  })

  it('returns nothing for an empty pool and respects the limit', () => {
    assert.deepEqual(rankFeatured([], NO_AFFINITY, FEATURED_DEFAULTS, 's', 10, NOW), [])
    assert.equal(rankFeatured(pool, NO_AFFINITY, FEATURED_DEFAULTS, 's', 2, NOW).length, 2)
  })
})

describe('span and sanitizeWeights', () => {
  it('speaks in days, months and years', () => {
    assert.equal(span(3 * day), '3 days')
    assert.equal(span(200 * day), '7 months')
    assert.equal(span(800 * day), '2 years')
    assert.equal(span(365 * day), '1 year')
  })
  it('clamps and ignores junk', () => {
    const w = sanitizeWeights({ dormant: 5, watched: -3, rated: 'x', surprise: 0.123 }, FEATURED_DEFAULTS)
    assert.equal(w.dormant, 1)
    assert.equal(w.watched, -1)
    assert.equal(w.rated, FEATURED_DEFAULTS.rated)
    assert.equal(w.surprise, 0.12)
  })
})
