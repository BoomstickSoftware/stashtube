import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planCleanup } from './cleanup.ts'

const m = (id: number, o: Partial<{ hasFile: boolean; monitored: boolean; itemType: 'scene' | 'movie'; stashId: string; studioForeignId: string }> = {}) => ({ id, hasFile: false, monitored: false, itemType: 'scene' as const, stashId: `s${id}`, studioForeignId: 'x', ...o })

test('only unmonitored scene records without a file that nothing is fetching are removed', () => {
  const p = planCleanup(
    [m(1), m(2, { hasFile: true }), m(3, { monitored: true }), m(4), m(5), m(6), m(7, { itemType: 'movie' }), m(8)],
    new Set([4]), // downloading
    new Set([5]), // a Get
    new Set(['s6']), // queued
  )
  assert.deepEqual(p.remove, [1, 8])
  assert.deepEqual(p.kept, { file: 1, monitored: 1, busy: 1, gets: 1, queued: 1, films: 1 })
  assert.equal(p.total, 8)
})

test('a studio limits the plan to that studio', () => {
  const p = planCleanup([m(1, { studioForeignId: 'a' }), m(2, { studioForeignId: 'b' })], new Set(), new Set(), new Set(), 'a')
  assert.deepEqual(p.remove, [1])
})
