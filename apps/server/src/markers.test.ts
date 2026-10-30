// The marker mapper: untitled markers take their primary tag's name, and the tag id rides along
// so the Moments list can change it.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toMarker } from './stash.ts'

describe('toMarker', () => {
  it('keeps a title and carries the primary tag', () => {
    assert.deepEqual(toMarker({ id: '7', seconds: 12.3, end_seconds: null, title: 'Kitchen', primary_tag: { id: '3', name: 'Kitchen' } }), {
      id: '7',
      seconds: 12.3,
      endSeconds: null,
      title: 'Kitchen',
      tag: 'Kitchen',
      tagId: '3',
    })
  })
  it('names an untitled marker after its tag', () => {
    const m = toMarker({ id: '8', seconds: 5, end_seconds: 9, title: '', primary_tag: { id: '1', name: 'Highlight' } })
    assert.equal(m.title, 'Highlight')
    assert.equal(m.endSeconds, 9)
  })
  it('survives a marker with no tag', () => {
    assert.deepEqual(toMarker({ id: '9', seconds: 1, end_seconds: null, title: '', primary_tag: null }), { id: '9', seconds: 1, endSeconds: null, title: '', tag: '', tagId: '' })
  })
})
