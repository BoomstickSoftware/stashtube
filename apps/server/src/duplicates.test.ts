// Which copy of a duplicated video survives: the rule in duplicates.ts, pinned.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DuplicateScene } from '@flix/shared'
import { pickKeep, toGroup } from './duplicates.ts'

const scene = (id: string, o: Partial<DuplicateScene> & { bitrate?: number } = {}): DuplicateScene => ({
  id,
  title: `s${id}`,
  date: null,
  durationSec: 600,
  compat: 'everywhere',
  width: o.width ?? 1920,
  height: o.height ?? 1080,
  size: o.size ?? 1_000,
  rating: o.rating ?? 0,
  playCount: o.playCount ?? 0,
  oCount: o.oCount ?? 0,
  resumeTime: 0,
  lastPlayedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  studio: null,
  performers: [],
  screenshot: '',
  preview: null,
  vtt: null,
  file: { path: `/x/${id}.mp4`, bitrate: o.bitrate ?? 8_000_000, videoCodec: 'h264', framerate: 30 },
})

describe('pickKeep', () => {
  it('keeps the copy with more pixels whatever its other facts', () => {
    assert.equal(pickKeep([scene('1', { height: 720, width: 1280, bitrate: 20_000_000, size: 9_000, playCount: 5 }), scene('2')]), '2')
  })
  it('breaks a resolution tie by bit rate, then by size', () => {
    assert.equal(pickKeep([scene('1', { bitrate: 6_000_000 }), scene('2', { bitrate: 9_000_000 })]), '2')
    assert.equal(pickKeep([scene('1', { size: 500 }), scene('2', { size: 700 })]), '2')
  })
  it('keeps the watched or rated copy when the files are a wash', () => {
    assert.equal(pickKeep([scene('1'), scene('2', { playCount: 1 })]), '2')
    assert.equal(pickKeep([scene('1', { rating: 4 }), scene('2')]), '1')
  })
  it('is stable: identical files keep the lowest id', () => {
    assert.equal(pickKeep([scene('10'), scene('9'), scene('11')]), '9')
  })
  it('keeps a singleton', () => {
    assert.equal(pickKeep([scene('7')]), '7')
  })
})

describe('toGroup', () => {
  it('orders best first and suggests everything but the kept copy', () => {
    const g = toGroup([scene('1', { height: 480, width: 854 }), scene('2'), scene('3', { height: 2160, width: 3840 })])
    assert.equal(g.keep, '3')
    assert.deepEqual(g.scenes.map((s) => s.id), ['3', '2', '1'])
    assert.deepEqual(g.suggested, ['1', '2'])
  })
})
