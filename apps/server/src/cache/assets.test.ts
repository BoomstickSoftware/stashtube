import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import sharp from 'sharp'
import { AssetCache } from './assets.ts'

// A Stash that answers from a table; `calls` records what reached it.
function fakeStash(table: Record<string, { body?: string; status?: number; etag?: string }>) {
  const calls: { path: string; headers: Record<string, string> }[] = []
  const upstream = async (path: string, headers: Record<string, string>) => {
    calls.push({ path, headers })
    const r = table[path]
    if (!r) return new Response(null, { status: 404 })
    if (r.etag && headers['if-none-match'] === r.etag) return new Response(null, { status: 304 })
    return new Response(r.body ?? '', { status: r.status ?? 200, headers: { 'content-type': 'image/jpeg', ...(r.etag ? { etag: r.etag } : {}) } })
  }
  return { calls, upstream }
}

const withDir = async (fn: (dir: string) => Promise<void>) => {
  const dir = await mkdtemp(join(tmpdir(), 'flix-assets-'))
  try {
    await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
const get = (path: string, headers: Record<string, string> = {}) => new Request(`http://flix${path}`, { headers })

describe('AssetCache', () => {
  it('fetches once, then serves from disk', () =>
    withDir(async (dir) => {
      const stash = fakeStash({ '/scene/1/screenshot?t=1': { body: 'jpeg-bytes' } })
      const c = new AssetCache({ dir, ttl: 1000, missTtl: 1000, maxBytes: 1 << 20, upstream: stash.upstream })
      const a = await c.serve('/scene/1/screenshot?t=1', get('/x'), 'public')
      assert.equal(await a.text(), 'jpeg-bytes')
      const b = await c.serve('/scene/1/screenshot?t=1', get('/x'), 'public')
      assert.equal(b.headers.get('content-type'), 'image/jpeg')
      assert.equal(await b.text(), 'jpeg-bytes')
      assert.equal(stash.calls.length, 1)
      assert.deepEqual([c.stats().misses, c.stats().hits], [1, 1])
    }))

  it('revalidates an unversioned path after its TTL and keeps the copy on 304', () =>
    withDir(async (dir) => {
      const stash = fakeStash({ '/scene/1/preview': { body: 'clip', etag: '"v1"' } })
      const c = new AssetCache({ dir, ttl: 0, missTtl: 1000, maxBytes: 1 << 20, upstream: stash.upstream })
      await (await c.serve('/scene/1/preview', get('/x'), 'public')).text()
      const r = await c.serve('/scene/1/preview', get('/x'), 'public')
      assert.equal(await r.text(), 'clip')
      assert.equal(stash.calls[1]?.headers['if-none-match'], '"v1"')
      assert.equal(c.stats().revalidated, 1)
      const notModified = await c.serve('/scene/1/preview', get('/x', { 'if-none-match': '"v1"' }), 'public')
      assert.equal(notModified.status, 304)
    }))

  it('gives a file Stash sent without a validator its own weak ETag, and answers 304 on it', () =>
    withDir(async (dir) => {
      const stash = fakeStash({ '/scene/1/preview': { body: 'clip' } })
      const c = new AssetCache({ dir, ttl: 1000, missTtl: 1000, maxBytes: 1 << 20, upstream: stash.upstream })
      const first = await c.serve('/scene/1/preview', get('/x'), 'public')
      await first.text()
      const etag = first.headers.get('etag')
      assert.match(etag ?? '', /^W\/"flix-/)
      const again = await c.serve('/scene/1/preview', get('/x', { 'if-none-match': etag! }), 'public')
      assert.equal(again.status, 304)
      assert.equal(stash.calls.length, 1)
      // past the TTL the file is refetched outright: our tag means nothing to Stash
      const expired = new AssetCache({ dir, ttl: 0, missTtl: 1000, maxBytes: 1 << 20, upstream: stash.upstream })
      await (await expired.serve('/scene/1/preview', get('/x'), 'public')).text()
      assert.equal(stash.calls.length, 2)
      assert.equal(stash.calls[1]?.headers['if-none-match'], undefined)
    }))

  it('serves the old copy when Stash fails or answers 404', () =>
    withDir(async (dir) => {
      const table: Record<string, { body?: string }> = { '/scene/1/preview': { body: 'clip' } }
      const stash = fakeStash(table)
      const c = new AssetCache({ dir, ttl: 0, missTtl: 1000, maxBytes: 1 << 20, upstream: stash.upstream })
      await (await c.serve('/scene/1/preview', get('/x'), 'public')).text()
      delete table['/scene/1/preview'] // Stash now 404s (a scan holds its database)
      assert.equal(await (await c.serve('/scene/1/preview', get('/x'), 'public')).text(), 'clip')
      assert.equal(c.stats().staleServed, 1)
    }))

  it('remembers a 404 briefly after retrying it', () =>
    withDir(async (dir) => {
      const stash = fakeStash({})
      const c = new AssetCache({ dir, ttl: 1000, missTtl: 60_000, maxBytes: 1 << 20, upstream: stash.upstream })
      assert.equal((await c.serve('/scene/2/preview', get('/x'), 'public')).status, 404)
      assert.equal((await c.serve('/scene/2/preview', get('/x'), 'public')).status, 404)
      assert.equal(stash.calls.length, 3, 'two retries on the first miss, none on the second')
      assert.equal(c.stats().notFound, 2)
    }))

  it('answers byte ranges from the cached file', () =>
    withDir(async (dir) => {
      const stash = fakeStash({ '/scene/1/sprite.jpg': { body: '0123456789' } })
      const c = new AssetCache({ dir, ttl: 1000, missTtl: 1000, maxBytes: 1 << 20, upstream: stash.upstream })
      const r = await c.serve('/scene/1/sprite.jpg', get('/x', { range: 'bytes=2-4' }), 'public')
      assert.equal(r.status, 206)
      assert.equal(await r.text(), '234')
    }))

  it('evicts the least recently used files over the size limit', () =>
    withDir(async (dir) => {
      const stash = fakeStash({ '/a?t=1': { body: 'x'.repeat(60) }, '/b?t=1': { body: 'y'.repeat(60) }, '/c?t=1': { body: 'z'.repeat(60) } })
      const c = new AssetCache({ dir, ttl: 1000, missTtl: 1000, maxBytes: 150, upstream: stash.upstream })
      for (const p of ['/a?t=1', '/b?t=1', '/c?t=1']) await (await c.serve(p, get('/x'), 'public')).text()
      assert.ok(c.stats().evictions >= 1)
      assert.ok(c.stats().bytes <= 150)
    }))

  it('makes a smaller WebP copy of an image once, and serves anything else as it is', () =>
    withDir(async (dir) => {
      const jpeg = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#357' } }).jpeg().toBuffer()
      const calls: string[] = []
      const upstream = async (path: string) => {
        calls.push(path)
        if (path.startsWith('/scene/1/')) return new Response(new Uint8Array(jpeg), { headers: { 'content-type': 'image/jpeg' } })
        return new Response('WEBVTT', { headers: { 'content-type': 'text/vtt' } })
      }
      const c = new AssetCache({ dir, ttl: 1000, missTtl: 1000, maxBytes: 1 << 24, upstream })
      const small = await c.serveResized('/scene/1/screenshot?t=1', 640, get('/x'), 'public')
      assert.equal(small.headers.get('content-type'), 'image/webp')
      assert.match(small.headers.get('etag') ?? '', /^W\/"flix-/, 'a resized copy carries its own ETag')
      const img = sharp(Buffer.from(await small.arrayBuffer()))
      assert.equal((await img.metadata()).width, 640)
      await (await c.serveResized('/scene/1/screenshot?t=1', 640, get('/x'), 'public')).arrayBuffer()
      const full = await c.serve('/scene/1/screenshot?t=1', get('/x'), 'public')
      assert.equal(full.headers.get('content-type'), 'image/jpeg')
      await full.arrayBuffer()
      assert.equal(calls.length, 1) // the original was fetched once, for both
      const vtt = await c.serveResized('/scene/1_thumbs.vtt', 640, get('/x'), 'public')
      assert.equal(await vtt.text(), 'WEBVTT')
    }))
})
