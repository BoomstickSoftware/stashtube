// The studio-defaults sync plan (studioCategories.ts plan): what flix adds, records and removes.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isCastTag, plan } from './studioCategories.ts'

const scene = (id: string, studioId: string | null, tagIds: string[] = []) => ({ id, studioId, tagIds })
const obj = (m: Map<string, string[]>) => Object.fromEntries(m)

describe('studio categories plan', () => {
  it('adds a default to the studio’s videos that lack it and records only those', () => {
    const p = plan([scene('1', 's', []), scene('2', 's', ['t']), scene('3', 'other')], new Map([['s', ['t']]]), [])
    assert.deepEqual(obj(p.add), { t: ['1'] })
    assert.deepEqual(p.record, [['1', 't']])
    assert.deepEqual(p.forget, [])
  })
  it('does not reach sub-studios (they have their own id)', () => {
    const p = plan([scene('1', 'child')], new Map([['parent', ['t']]]), [])
    assert.equal(p.add.size, 0)
  })
  it('puts back a default removed by hand', () => {
    const p = plan([scene('1', 's', [])], new Map([['s', ['t']]]), [['1', 't']])
    assert.deepEqual(obj(p.add), { t: ['1'] })
    assert.deepEqual(p.forget, [])
  })
  it('removes a dropped default only where flix added it', () => {
    const p = plan([scene('1', 's', ['t']), scene('2', 's', ['t'])], new Map(), [['1', 't']])
    assert.deepEqual(obj(p.remove), { t: ['1'] })
    assert.deepEqual(p.forget, [['1', 't']])
  })
  it('follows a video to a new studio, and forgets deleted videos', () => {
    const p = plan([scene('1', 'b', ['t'])], new Map([['a', ['t']]]), [['1', 't'], ['9', 't']])
    assert.deepEqual(obj(p.remove), { t: ['1'] })
    assert.deepEqual(p.forget, [['1', 't'], ['9', 't']])
  })
  it('forgets a record whose category was already taken off by hand', () => {
    const p = plan([scene('1', 's', [])], new Map(), [['1', 't']])
    assert.equal(p.remove.size, 0)
    assert.deepEqual(p.forget, [['1', 't']])
  })
  it('knows the Cast categories', () => {
    assert.ok(isCastTag('Cast') && isCastTag('Cast: F+M') && !isCastTag('Castle'))
  })
})
