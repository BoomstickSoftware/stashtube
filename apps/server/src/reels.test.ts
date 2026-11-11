import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampClip, fadeLevel, FADE_SEC, locate, planReel, reelTime } from '@flix/shared'
import { clipStatus } from './reels.ts'

const clip = (id: number, start: number, end: number, transition: 'cut' | 'fade' | null = null, status?: 'ok' | 'shifted' | 'missing') => ({ id, sceneId: String(100 + id), start, end, transition, status })

test('a reel is as long as its clips and each segment starts where the last ended', () => {
  const p = planReel({ transition: 'cut', clips: [clip(1, 10, 18), clip(2, 100, 105), clip(3, 0, 2.5)] })
  assert.equal(p.duration, 15.5)
  assert.deepEqual(p.segments.map((s) => [s.at, s.length]), [[0, 8], [8, 5], [13, 2.5]])
})

test('a clip follows the reel default unless it sets its own transition; the last has none', () => {
  const p = planReel({ transition: 'fade', clips: [clip(1, 0, 5), clip(2, 0, 5, 'cut'), clip(3, 0, 5)] })
  assert.deepEqual(p.segments.map((s) => s.into), ['fade', 'cut', null])
  assert.deepEqual(p.segments.map((s) => s.from), [null, 'fade', 'cut'])
})

test('missing clips and empty ranges are not planned; shifted ones are', () => {
  const p = planReel({ transition: 'cut', clips: [clip(1, 0, 5, null, 'missing'), clip(2, 3, 3), clip(3, 0, 4, null, 'shifted')] })
  assert.deepEqual(p.segments.map((s) => s.clipId), [3])
  assert.equal(p.segments[0].index, 0)
  assert.equal(p.duration, 4)
})

test('locate maps reel time to a clip and its video time, and reelTime maps back', () => {
  const p = planReel({ transition: 'cut', clips: [clip(1, 10, 18), clip(2, 100, 105)] })
  assert.deepEqual([locate(p, 0)?.segment.clipId, locate(p, 0)?.time], [1, 10])
  assert.deepEqual([locate(p, 7.5)?.segment.clipId, locate(p, 7.5)?.time], [1, 17.5])
  assert.deepEqual([locate(p, 8)?.segment.clipId, locate(p, 8)?.time], [2, 100]) // a boundary belongs to the next clip
  assert.deepEqual([locate(p, 99)?.segment.clipId, locate(p, 99)?.time], [2, 105]) // past the end: the last frame
  assert.deepEqual([locate(p, -3)?.segment.clipId, locate(p, -3)?.time], [1, 10])
  assert.equal(locate(planReel({ transition: 'cut', clips: [] }), 0), null)
  assert.equal(reelTime(p.segments[1], 102), 10)
  assert.equal(reelTime(p.segments[1], 500), 13) // clamped to the clip
  assert.equal(reelTime(p.segments[1], 50), 8)
})

test('a fade dips to black at the join and nowhere else', () => {
  const p = planReel({ transition: 'cut', clips: [clip(1, 0, 10, 'fade'), clip(2, 0, 10), clip(3, 0, 10)] })
  assert.equal(fadeLevel(p, 0), 1) // the reel does not fade in
  assert.equal(fadeLevel(p, 5), 1)
  assert.ok(Math.abs(fadeLevel(p, 10 - FADE_SEC / 2) - 0.5) < 1e-9)
  assert.equal(fadeLevel(p, 10), 0) // start of clip 2
  assert.ok(Math.abs(fadeLevel(p, 10 + FADE_SEC / 2) - 0.5) < 1e-9)
  assert.equal(fadeLevel(p, 10 + FADE_SEC), 1)
  assert.equal(fadeLevel(p, 20 - 0.01), 1) // clip 2 cuts to clip 3
  assert.equal(fadeLevel(p, 30), 1) // the reel does not fade out
})

test('a clip shorter than two fades splits its length between them', () => {
  const p = planReel({ transition: 'fade', clips: [clip(1, 0, 5), clip(2, 0, 0.4), clip(3, 0, 5)] })
  assert.ok(Math.abs(fadeLevel(p, 5.2) - 1) < 1e-9) // its middle is fully shown
  assert.ok(fadeLevel(p, 5.1) < 1)
})

test('clampClip keeps a range inside the video, ordered and at least a second long', () => {
  assert.deepEqual(clampClip(10, 20, 60), { start: 10, end: 20 })
  assert.deepEqual(clampClip(-5, 999, 60), { start: 0, end: 60 })
  assert.deepEqual(clampClip(30, 30.2, 60), { start: 30, end: 31 })
  assert.deepEqual(clampClip(59.8, 60, 60), { start: 59, end: 60 })
  assert.deepEqual(clampClip(20, 10, 60), { start: 20, end: 21 })
  assert.deepEqual(clampClip(Number.NaN, Number.NaN, 60), { start: 0, end: 60 })
  assert.equal(clampClip(0, 1, 0.5), null)
  assert.deepEqual(clampClip(1.23456, 5.98765, 60), { start: 1.235, end: 5.988 })
})

test('a clip is shifted when its video changed length and missing when the video is gone', () => {
  assert.equal(clipStatus(600, 600.2), 'ok')
  assert.equal(clipStatus(600, 601), 'shifted')
  assert.equal(clipStatus(600, null), 'missing')
})
