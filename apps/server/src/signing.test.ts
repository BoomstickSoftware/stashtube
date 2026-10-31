import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { playbackScene, signRemote, signScene, verifyRemote, verifyScene } from './signing.ts'

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

describe('signed remote covers', () => {
  const url = 'https://stashdb.org/images/7e9a8bdb-9933-499b-bf47-c768a450cb0c'

  it('round-trips a URL through a URL-safe token', () => {
    const t = signRemote(url)
    assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    assert.equal(verifyRemote(t), url)
  })

  it('rejects a token that was not made here', () => {
    const t = signRemote(url)
    const [body, sig] = t.split('.')
    assert.equal(verifyRemote(`${body}.${sig!.slice(0, -1)}x`), null) // wrong mac
    assert.equal(verifyRemote(`${Buffer.from('https://evil.example/x').toString('base64url')}.${sig}`), null) // another URL, same mac
    assert.equal(verifyRemote(body), null) // no mac
    assert.equal(verifyRemote(`${body}.`), null)
    assert.equal(verifyRemote(`.${sig}`), null)
    assert.equal(verifyRemote(''), null)
    assert.equal(verifyRemote(undefined), null)
    assert.equal(verifyRemote('not base64url!.x'), null)
  })
})
