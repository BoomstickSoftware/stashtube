// /api answers are conditional: a weak ETag of the JSON, 304 on a matching If-None-Match, and
// gzip still on the full answers (the middleware order in index.ts is mirrored here).
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { compress } from 'hono/compress'
import { describe, it } from 'node:test'
import { conditional } from './conditional.ts'

const app = new Hono()
app.use('/api/*', compress())
app.use('/api/*', ...conditional)
let version = 1
app.get('/api/home', (c) => c.json({ rows: Array.from({ length: 200 }, (_, i) => ({ i, version })) }))
app.post('/api/home', (c) => c.json({ ok: true }))
app.get('/api/missing', (c) => c.json({ error: 'not found' }, 404))

const get = (path: string, headers: Record<string, string> = {}) => app.request(`http://flix${path}`, { headers: { host: 'flix.lan', ...headers } })

describe('conditional /api GETs', () => {
  it('tag the JSON weakly, ask the browser to revalidate, and answer 304 to a matching tag', async () => {
    const first = await get('/api/home')
    const tag = first.headers.get('etag')
    assert.ok(tag?.startsWith('W/"'), `weak tag, got ${tag}`)
    assert.equal(first.headers.get('cache-control'), 'private, no-cache')
    assert.equal((await first.json()).rows.length, 200)

    const again = await get('/api/home', { 'if-none-match': tag! })
    assert.equal(again.status, 304)
    assert.equal(again.headers.get('etag'), tag)
    assert.equal(again.headers.get('cache-control'), 'private, no-cache')
    assert.equal(await again.text(), '')

    version++ // the cached answer changed: a full 200 with a new tag
    const changed = await get('/api/home', { 'if-none-match': tag! })
    assert.equal(changed.status, 200)
    assert.notEqual(changed.headers.get('etag'), tag)
  })

  it('still gzip the full answer, and tag it over the uncompressed JSON', async () => {
    const plain = await get('/api/home')
    const zipped = await get('/api/home', { 'accept-encoding': 'gzip' })
    assert.equal(zipped.headers.get('content-encoding'), 'gzip')
    assert.equal(zipped.headers.get('etag'), plain.headers.get('etag'), 'the same tag whatever the encoding')
    const n304 = await get('/api/home', { 'accept-encoding': 'gzip', 'if-none-match': plain.headers.get('etag')! })
    assert.equal(n304.status, 304)
    assert.equal(n304.headers.get('content-encoding'), null)
  })

  it('leave writes and errors alone', async () => {
    const post = await app.request('http://flix/api/home', { method: 'POST', headers: { host: 'flix.lan' } })
    assert.equal(post.headers.get('etag'), null)
    assert.equal(post.headers.get('cache-control'), null)
    const err = await get('/api/missing')
    assert.equal(err.status, 404)
    assert.equal(err.headers.get('etag'), null)
    assert.equal(err.headers.get('cache-control'), null)
  })
})
