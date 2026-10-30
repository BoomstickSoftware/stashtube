// The pure parts of station previews: the per-station daily seed and the bounded fan-out.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mapBounded, previewSeed } from './previews.ts'

describe('previewSeed', () => {
  it('differs per station and per day, and repeats within a day', () => {
    assert.equal(previewSeed(5, { unwatched: true }), previewSeed(5, { unwatched: true }))
    assert.notEqual(previewSeed(5, { unwatched: true }), previewSeed(6, { unwatched: true }))
    assert.notEqual(previewSeed(5, { unwatched: true }), previewSeed(5, { minRating: 4 }))
  })
})

describe('mapBounded', () => {
  it('keeps input order and never runs more than the limit at once', async () => {
    let running = 0
    let peak = 0
    const out = await mapBounded([30, 5, 20, 1, 10], 2, async (ms) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, ms))
      running--
      return ms * 2
    })
    assert.deepEqual(out, [60, 10, 40, 2, 20])
    assert.equal(peak, 2)
  })
  it('handles an empty list and a limit above the length', async () => {
    assert.deepEqual(await mapBounded([], 4, async (x) => x), [])
    assert.deepEqual(await mapBounded([1, 2], 10, async (x) => x + 1), [2, 3])
  })
})
