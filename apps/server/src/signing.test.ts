import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { playbackScene, signScene, verifyScene } from './signing.ts'

describe('signed playback links', () => {
  it('verifies its own token for that scene only', () => {
    const t = signScene('12')
    assert.ok(verifyScene('12', t))
    assert.ok(!verifyScene('13', t))
    assert.ok(!verifyScene('12', `${t}x`))
    assert.ok(!verifyScene('12', undefined))
  })

  it('rejects an expired or malformed token', () => {
    const [, sig] = signScene('12').split('.')
    assert.ok(!verifyScene('12', `${Math.floor(Date.now() / 1000) - 10}.${sig}`))
    assert.ok(!verifyScene('12', 'nope'))
    assert.ok(!verifyScene('12', '123.'))
  })

  it('knows which media paths play a scene', () => {
    assert.equal(playbackScene('/media/play/42'), '42')
    assert.equal(playbackScene('/media/stash/scene/42/stream.m3u8?resolution=ORIGINAL'), '42')
    assert.equal(playbackScene('/media/stash/scene/42/stream/segment_3.ts'), '42')
    assert.equal(playbackScene('/media/stash/scene/42/screenshot?t=1'), null)
    assert.equal(playbackScene('/media/stash/performer/42/image'), null)
  })
})
