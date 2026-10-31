// Identify against a fake Stash: the request waits for the job and drops the caches when it
// finishes; a job that outlives the wait is answered as running and followed in the background,
// so the caches are dropped even when nobody polls (the scene page may be gone by then).
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { JobStatus } from '@flix/shared'
import { dataCache, identifyScene } from './stash.ts'

// What findJob answers next, in order; the last one repeats. `null` means Stash no longer lists it.
let statuses: (JobStatus['status'] | null)[] = []
const asked: string[] = [] // every GraphQL operation sent
const fakeStash: typeof fetch = async (_url, init) => {
  const { query } = JSON.parse(String(init?.body)) as { query: string }
  if (query.includes('metadataIdentify')) {
    asked.push('identify')
    return Response.json({ data: { metadataIdentify: '42' } })
  }
  if (query.includes('findJob')) {
    asked.push('findJob')
    const status = statuses.length > 1 ? statuses.shift()! : statuses[0]!
    return Response.json({ data: { findJob: status === null ? null : { id: '42', status, progress: status === 'FINISHED' ? 1 : 0.5, error: null } } })
  }
  throw new Error(`unexpected query: ${query}`)
}

const real = globalThis.fetch
beforeEach(() => {
  globalThis.fetch = fakeStash
  asked.length = 0
})
afterEach(() => {
  globalThis.fetch = real
})

const seed = (key: string, tags: string[]) => dataCache.get(key, 60_000, tags, async () => 'old')
const read = (key: string, tags: string[]) => dataCache.get(key, 60_000, tags, async () => 'new')
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('identifyScene', () => {
  it('waits for the job and drops the scene, performer, studio and tag caches when it finishes', async () => {
    await seed('id-scene', ['scene'])
    await seed('id-performer', ['performer'])
    await seed('id-list', ['whisparr'])
    statuses = ['RUNNING', 'RUNNING', 'FINISHED']
    const j = await identifyScene('1', { waitMs: 5_000, pollMs: 2 })
    assert.equal(j.id, '42')
    assert.equal(j.status, 'FINISHED')
    assert.deepEqual(asked, ['identify', 'findJob', 'findJob', 'findJob'])
    assert.equal(await read('id-scene', ['scene']), 'new')
    assert.equal(await read('id-performer', ['performer']), 'new')
    assert.equal(await read('id-list', ['whisparr']), 'old', 'unrelated caches are kept')
  })

  it('returns the running job past the wait and keeps following it until it finishes', async () => {
    await seed('id-late', ['scene'])
    statuses = ['RUNNING']
    const j = await identifyScene('1', { waitMs: 15, pollMs: 3 })
    assert.equal(j.status, 'RUNNING')
    assert.equal(j.id, '42')
    assert.equal(await read('id-late', ['scene']), 'old', 'nothing dropped while the job runs')
    statuses = ['FINISHED']
    await settle(30)
    assert.equal(await read('id-late', ['scene']), 'new', 'dropped by the background follower')
  })

  it('treats a job Stash no longer lists as finished', async () => {
    await seed('id-gone', ['tag'])
    statuses = [null]
    const j = await identifyScene('1', { waitMs: 1_000, pollMs: 2 })
    assert.equal(j.status, 'FINISHED')
    assert.equal(await read('id-gone', ['tag']), 'new')
  })
})
