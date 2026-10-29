import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { MemoryCache, VOLATILE } from './memory.ts'

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('MemoryCache', () => {
  it('loads once, then answers from memory while fresh', async () => {
    const c = new MemoryCache({ maxEntries: 10, staleFor: 1000 })
    let loads = 0
    const load = async () => ++loads
    assert.equal(await c.get('k', 1000, ['t'], load), 1)
    assert.equal(await c.get('k', 1000, ['t'], load), 1)
    assert.deepEqual([c.stats().misses, c.stats().hits], [1, 1])
  })

  it('serves a stale entry at once and refreshes it in the background', async () => {
    const c = new MemoryCache({ maxEntries: 10, staleFor: 10_000 })
    let loads = 0
    const load = async () => ++loads
    await c.get('k', 0, [], load) // fresh for 0 ms: stale on the next read
    await tick()
    assert.equal(await c.get('k', 1000, [], load), 1, 'the old value, right away')
    await tick()
    assert.equal(await c.get('k', 1000, [], load), 2, 'the refreshed one')
    assert.equal(c.stats().staleHits, 1)
  })

  it('shares one load between concurrent readers', async () => {
    const c = new MemoryCache({ maxEntries: 10, staleFor: 1000 })
    let loads = 0
    const load = () => tick().then(() => ++loads)
    const [a, b] = await Promise.all([c.get('k', 1000, [], load), c.get('k', 1000, [], load)])
    assert.deepEqual([a, b, loads, c.stats().coalesced], [1, 1, 1, 1])
  })

  it('drops entries by tag and marks others stale', async () => {
    const c = new MemoryCache({ maxEntries: 10, staleFor: 10_000 })
    let loads = 0
    const load = async () => ++loads
    await c.get('a', 1000, ['scene', 'scene:1'], load)
    await c.get('b', 1000, ['scene'], load)
    c.invalidate('scene:1')
    assert.equal(c.stats().entries, 1)
    c.expire('scene')
    assert.equal(await c.get('b', 1000, ['scene'], load), 2, 'stale: served, then refreshed')
  })

  it('does not store a result that started before a clear', async () => {
    const c = new MemoryCache({ maxEntries: 10, staleFor: 1000 })
    const p = c.get('k', 1000, [], () => tick().then(() => 'old'))
    c.clear()
    assert.equal(await p, 'old')
    assert.equal(c.stats().entries, 0)
  })

  it('evicts the least recently used entry over the limit', async () => {
    const c = new MemoryCache({ maxEntries: 2, staleFor: 1000 })
    await c.get('a', 1000, [], async () => 1)
    await c.get('b', 1000, [], async () => 2)
    await c.get('a', 1000, [], async () => 1) // a is now the most recent
    await c.get('c', 1000, [], async () => 3)
    assert.equal(c.stats().evictions, 1)
    assert.equal(await c.get('b', 1000, [], async () => 'reloaded'), 'reloaded')
  })

  it('saves and restores live entries, leaving volatile ones out', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flix-mem-'))
    try {
      const file = join(dir, 'data.json')
      const c = new MemoryCache({ maxEntries: 10, staleFor: 10_000 })
      await c.get('keep', 1000, ['scene'], async () => 'v')
      await c.get('big', 1000, ['scene', VOLATILE], async () => 'x'.repeat(100))
      await c.save(file)
      const saved = JSON.parse(await readFile(file, 'utf8')) as [string, unknown][]
      assert.deepEqual(saved.map(([k]) => k), ['keep'])
      const d = new MemoryCache({ maxEntries: 10, staleFor: 10_000 })
      assert.equal(await d.load(file), 1)
      assert.equal(await d.get('keep', 1000, [], async () => 'reloaded'), 'v')
      await c.save(file) // nothing changed: no write
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
