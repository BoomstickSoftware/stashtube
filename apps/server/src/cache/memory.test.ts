import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { MemoryCache, PINNED, VOLATILE } from './memory.ts'

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

  it('keeps a fetch that was running when an unrelated tag changed', async () => {
    const c = new MemoryCache({ maxEntries: 10, staleFor: 1000 })
    let release!: (v: string) => void
    const slow = c.get('library', 1000, ['scene'], () => new Promise<string>((r) => (release = r)))
    c.invalidate('scene:7', 'activity:resume') // a progress save on another video
    c.expire('activity:resume')
    release('all scenes')
    assert.equal(await slow, 'all scenes')
    let loads = 0
    assert.equal(await c.get('library', 1000, ['scene'], async () => `again ${++loads}`), 'all scenes', 'stored, so no second fetch')
  })

  it('drops a fetch whose own tag changed while it ran, and does not let new reads join it', async () => {
    const c = new MemoryCache({ maxEntries: 10, staleFor: 1000 })
    let release!: (v: string) => void
    const old = c.get('scene:1', 1000, ['scene:1'], () => new Promise<string>((r) => (release = r)))
    c.invalidate('scene:1') // a rating saved meanwhile
    const fresh = c.get('scene:1', 1000, ['scene:1'], async () => 'rated')
    release('unrated')
    assert.equal(await old, 'unrated')
    assert.equal(await fresh, 'rated', 'a new fetch, not the one from before the write')
    assert.equal(await c.get('scene:1', 1000, ['scene:1'], async () => 'third'), 'rated')
  })

  it('caps the volatile entries on their own, oldest out', async () => {
    const c = new MemoryCache({ maxEntries: 100, staleFor: 1000, maxVolatile: 2 })
    for (const k of ['a', 'b', 'c']) await c.get(k, 1000, [VOLATILE], async () => k)
    await c.get('kept', 1000, ['scene'], async () => 'kept')
    let loads = 0
    assert.equal(await c.get('a', 1000, [VOLATILE], async () => `a${++loads}`), 'a1', 'a was evicted')
    assert.equal(await c.get('c', 1000, [VOLATILE], async () => 'reloaded'), 'c')
    assert.equal(await c.get('kept', 1000, ['scene'], async () => 'reloaded'), 'kept')
  })

  it('leaves pinned entries out of the volatile sweep and out of the snapshot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flix-mem-'))
    try {
      const c = new MemoryCache({ maxEntries: 100, staleFor: 10_000, maxVolatile: 2 })
      await c.get('movies', 1000, ['whisparr', PINNED], async () => 'the 41 MB list')
      for (const k of ['p1', 'p2', 'p3']) await c.get(k, 1000, [VOLATILE], async () => k) // 3 pages through a cap of 2
      assert.equal(await c.get('movies', 1000, ['whisparr', PINNED], async () => 'refetched'), 'the 41 MB list', 'not swept')
      assert.equal(await c.get('p1', 1000, [VOLATILE], async () => 'again'), 'again', 'the oldest page was')
      const file = join(dir, 'data.json')
      await c.save(file)
      const saved = JSON.parse(await readFile(file, 'utf8')) as [string, unknown][]
      assert.deepEqual(saved.map(([k]) => k), [], 'memory only')
      c.invalidate('whisparr')
      assert.equal(await c.get('movies', 1000, ['whisparr', PINNED], async () => 'refetched'), 'refetched', 'still dropped by its tag')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('a freshInputs loader waits for its stale inputs instead of re-storing them as fresh', async () => {
    const c = new MemoryCache({ maxEntries: 10, staleFor: 10_000 })
    let raw = 1
    const input = () => c.get('raw', 1000, ['scene'], async () => `raw${raw++}`)
    const facets = () => c.get('facets', 1000, ['scene'], async () => `facets of ${await input()}`, { freshInputs: true })
    assert.equal(await facets(), 'facets of raw1')
    c.expire('scene') // a rating: both stale
    assert.equal(await facets(), 'facets of raw1', 'the stale answer, at once')
    await tick()
    assert.equal(await facets(), 'facets of raw2', 'rebuilt from a refetched input, not the stale one')
    assert.equal(await input(), 'raw2', 'and the input itself is fresh: one refetch, shared')
    // without the option the stale input is handed out and the answer would be stale for a TTL
    const plain = () => c.get('plain', 1000, ['scene'], async () => `plain of ${await input()}`)
    c.expire('scene')
    await plain()
    await tick()
    assert.equal(await plain(), 'plain of raw2')
  })

  it('patches a live entry in place without touching its age', async () => {
    const c = new MemoryCache({ maxEntries: 10, staleFor: 10_000 })
    await c.get('list', 1000, ['whisparr'], async () => [1, 2])
    c.patch<number[]>('list', (l) => [...l, 3])
    c.patch<number[]>('missing', () => [9])
    assert.deepEqual(await c.get('list', 1000, ['whisparr'], async () => [0]), [1, 2, 3])
    assert.equal(c.stats().misses, 1)
  })
})
