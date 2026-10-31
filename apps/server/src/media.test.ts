// The /media/remote route: a token the server did not sign is a 404 and nothing is fetched;
// a good one is fetched once (through the asset cache), resized on request, and revalidated.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import sharp from 'sharp'
import { assetCache, media } from './media.ts'
import { remoteImageUrl } from './remote.ts'
import { signRemote } from './signing.ts'

// A fresh URL each run: the test cache dir survives between runs.
const COVER = `https://stashdb.org/images/test-${Date.now()}-${process.pid}`
const asked: string[] = []
let png: Buffer

const realFetch = globalThis.fetch

describe('/media/remote', () => {
  before(async () => {
    png = await sharp({ create: { width: 16, height: 8, channels: 3, background: '#c03' } }).png().toBuffer()
    globalThis.fetch = (async (url: string | URL | Request) => {
      asked.push(String(url))
      if (String(url) !== COVER) return new Response(null, { status: 404 })
      return new Response(new Uint8Array(png), { status: 200, headers: { 'content-type': 'image/png' } })
    }) as typeof fetch
  })
  after(async () => {
    globalThis.fetch = realFetch
    await assetCache.clear()
  })

  it('refuses a token it did not sign, without fetching', async () => {
    for (const bad of ['nope', 'aGVsbG8.c2ln', signRemote('https://evil.example/x.jpg'), `${signRemote(COVER)}x`]) {
      const res = await media.request(`/remote/${bad}`)
      assert.equal(res.status, 404, bad)
    }
    assert.deepEqual(asked, [])
  })

  it('serves a signed cover once from upstream, then from the cache, a week for the browser', async () => {
    const path = remoteImageUrl(COVER)!.replace('/media', '')
    const first = await media.request(path)
    assert.equal(first.status, 200)
    assert.equal(first.headers.get('content-type'), 'image/png')
    assert.equal(first.headers.get('cache-control'), 'private, max-age=604800')
    const etag = first.headers.get('etag')
    assert.ok(etag, 'an ETag so the browser can revalidate')
    assert.equal((await first.arrayBuffer()).byteLength, png.length)
    assert.deepEqual(asked, [COVER])

    const again = await media.request(path, { headers: { 'if-none-match': etag! } })
    assert.equal(again.status, 304)
    assert.deepEqual(asked, [COVER], 'the cache answered; StashDB was not asked twice')
  })

  it('resizes with ?w= to WebP, no wider than asked', async () => {
    const path = remoteImageUrl(COVER)!.replace('/media', '')
    const res = await media.request(`${path}?w=320`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'image/webp')
    assert.equal(res.headers.get('cache-control'), 'private, max-age=604800')
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    assert.equal(meta.format, 'webp')
    assert.equal(meta.width, 16) // never enlarged
    const other = await media.request(`${path}?w=123`) // not one of IMAGE_WIDTHS: the original
    assert.equal(other.headers.get('content-type'), 'image/png')
    assert.deepEqual(asked, [COVER])
  })
})
