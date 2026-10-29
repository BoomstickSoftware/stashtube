import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { serveFile } from './files.ts'

describe('serveFile', () => {
  let dir: string
  let file: string
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'flix-files-'))
    file = join(dir, 'v.bin')
    await writeFile(file, '0123456789')
  })
  after(() => rm(dir, { recursive: true, force: true }))
  const req = (range?: string, method = 'GET') => new Request('http://flix/v', { method, headers: range ? { range } : {} })

  it('sends the whole file without a range', async () => {
    const r = serveFile(file, 10, req(), { 'content-type': 'video/mp4' })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-length'), '10')
    assert.equal(r.headers.get('accept-ranges'), 'bytes')
    assert.equal(await r.text(), '0123456789')
  })

  it('answers a closed, an open and a suffix range', async () => {
    const closed = serveFile(file, 10, req('bytes=2-4'), {})
    assert.equal(closed.status, 206)
    assert.equal(closed.headers.get('content-range'), 'bytes 2-4/10')
    assert.equal(await closed.text(), '234')
    const open = serveFile(file, 10, req('bytes=7-'), {})
    assert.equal(await open.text(), '789')
    const suffix = serveFile(file, 10, req('bytes=-3'), {})
    assert.equal(suffix.headers.get('content-range'), 'bytes 7-9/10')
    assert.equal(await suffix.text(), '789')
    const clipped = serveFile(file, 10, req('bytes=8-100'), {})
    assert.equal(clipped.headers.get('content-range'), 'bytes 8-9/10')
  })

  it('rejects a range past the end', () => {
    const r = serveFile(file, 10, req('bytes=10-12'), {})
    assert.equal(r.status, 416)
    assert.equal(r.headers.get('content-range'), 'bytes */10')
  })

  it('answers HEAD with headers only', async () => {
    const r = serveFile(file, 10, req(undefined, 'HEAD'), {})
    assert.equal(r.headers.get('content-length'), '10')
    assert.equal(r.body, null)
  })
})
