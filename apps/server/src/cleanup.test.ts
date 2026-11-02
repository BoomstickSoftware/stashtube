import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyStudios, planCleanup } from './cleanup.ts'

const m = (id: number, o: Partial<{ hasFile: boolean; stashId: string; studioForeignId: string }> = {}) => ({ id, hasFile: false, stashId: `s${id}`, studioForeignId: 'x', ...o })

test('every record without a file goes unless downloading, a waiting Get or queued', () => {
  const p = planCleanup([m(1), m(2, { hasFile: true }), m(3), m(4), m(5), m(6)], new Set([3]), new Set([4]), new Set(['s5']))
  assert.deepEqual(p.remove, [1, 6])
  assert.deepEqual(p.kept, { file: 1, busy: 1, gets: 1, queued: 1 })
})

test('a studio narrows the scene plan', () => {
  assert.deepEqual(planCleanup([m(1, { studioForeignId: 'a' }), m(2, { studioForeignId: 'b' })], new Set(), new Set(), new Set(), 'a').remove, [1])
})

test('only studios with no scene record left go', () => {
  const studios = [{ id: 1, foreignId: 'a' }, { id: 2, foreignId: 'b' }, { id: 3, foreignId: 'c' }]
  assert.deepEqual(emptyStudios(studios, [{ studioForeignId: 'a' }]), [2, 3])
  assert.deepEqual(emptyStudios(studios, [{ studioForeignId: 'a' }], 'b'), [2])
})
