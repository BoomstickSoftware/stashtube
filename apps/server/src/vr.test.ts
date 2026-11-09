// Discover's VR filter (catalog.ts isVrScene, Settings hideVr). Names here are made up: the repo
// is public and may not name library content.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isVrScene } from './catalog.ts'

const scene = (o: { title?: string; studioName?: string | null; tags?: string[] }) => ({
  title: o.title ?? 'A plain title',
  studioName: o.studioName ?? 'Plain Studio',
  tags: (o.tags ?? []).map((name) => ({ id: name, name })),
})

describe('isVrScene', () => {
  it('reads VR in the title', () => {
    for (const title of ['[VR] Morning', 'Morning (VR)', 'Morning VR', 'Morning - Virtual Reality', 'Morning in 180°', 'Morning 360 VR', 'Morning 180 degrees'])
      assert.equal(isVrScene(scene({ title })), true, title)
  })
  it('reads VR in a category', () => {
    assert.equal(isVrScene(scene({ tags: ['Blonde', 'Virtual Reality'] })), true)
    assert.equal(isVrScene(scene({ tags: ['VR'] })), true)
    assert.equal(isVrScene(scene({ tags: ['VR Porn'] })), true)
  })
  it('reads VR in the studio name, in capitals only', () => {
    for (const studioName of ['ExampleVR', 'VRExample', 'Example VR', 'Virtual Real Example', 'VirtualRealExample', 'Virtual Example'])
      assert.equal(isVrScene(scene({ studioName })), true, studioName)
    assert.equal(isVrScene(scene({ studioName: 'Avril Studios' })), false, 'letters inside a word')
    assert.equal(isVrScene(scene({ studioName: 'Example Virtual' })), false, 'Virtual later in the name')
  })
  it('leaves ordinary scenes alone', () => {
    for (const title of ['Overdrive', 'Vroom', 'Leaving at 1800', 'Server room', 'Virtually yours'])
      assert.equal(isVrScene(scene({ title })), false, title)
    assert.equal(isVrScene(scene({ tags: ['Virtually Anything'], studioName: null })), false)
  })
})
