// The filter builder: Stash accepts one criterion per field per level and no AND beside an
// OR, and SQLite's parser overflows on long OR chains. These rules only show up as 500s from
// Stash, so they are pinned here.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type Exclusions, findFilter, sceneFilter, isBlocked, groupFolder, dataCache, updateSceneRating, addSceneO, setPerformerFavorite, updateScene, WarmDebounce } from './stash.ts'

const tick = () => new Promise((r) => setTimeout(r, 5))

// Stash answering every mutation with an empty object; nothing leaves the process.
async function withStash<T>(fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch
  globalThis.fetch = async () => Response.json({ data: { sceneUpdate: { id: '1' }, sceneAddO: { count: 1 }, performerUpdate: { id: '1' } } })
  try {
    return await fn()
  } finally {
    globalThis.fetch = real
  }
}

const none: Exclusions = { tags: [], performers: [], studios: [] }

// Walks an AND chain into a list of levels.
const levels = (f: Record<string, unknown>) => {
  const out: Record<string, unknown>[] = []
  for (let node = f; node; node = node.AND as Record<string, unknown>) out.push(Object.fromEntries(Object.entries(node).filter(([k]) => k !== 'AND')))
  return out
}

describe('sceneFilter', () => {
  it('puts plain criteria on one level', () => {
    const f = sceneFilter({ tags: '1,2', performers: '3', studios: '4', minRating: 4, minHeight: 1080, unwatched: true }, none)
    assert.deepEqual(levels(f), [
      {
        tags: { value: ['1', '2'], modifier: 'INCLUDES_ALL', depth: 0 },
        performers: { value: ['3'], modifier: 'INCLUDES_ALL' },
        studios: { value: ['4'], modifier: 'INCLUDES', depth: -1 },
        rating100: { value: 79, modifier: 'GREATER_THAN' },
        resolution: { value: 'STANDARD_HD', modifier: 'GREATER_THAN' },
        play_count: { value: 0, modifier: 'EQUALS' },
      },
    ])
  })

  it('nests a repeated field one AND deeper', () => {
    const f = sceneFilter({ minHeight: 720, maxHeight: 1080, minRating: 1, maxRating: 3 }, none)
    const [a, b, c] = levels(f)
    assert.equal(a.resolution && (a.resolution as { modifier: string }).modifier, 'GREATER_THAN')
    assert.deepEqual(b, { resolution: { value: 'STANDARD_HD', modifier: 'LESS_THAN' } })
    assert.deepEqual(c, { rating100: { value: 61, modifier: 'LESS_THAN' } })
  })

  it('applies the blocklist as exclusions, one per level', () => {
    const f = sceneFilter({}, { tags: ['9'], performers: ['8'], studios: ['7'] })
    assert.deepEqual(levels(f), [
      {},
      { tags: { value: ['9'], modifier: 'EXCLUDES', depth: -1 } },
      { performers: { value: ['8'], modifier: 'EXCLUDES' } },
      { studios: { value: ['7'], modifier: 'EXCLUDES', depth: -1 } },
    ])
  })

  it('lets an explicitly included id override its block, and merges xtags into the exclusions', () => {
    const f = sceneFilter({ tags: '9', xtags: '5,9', performers: '8' }, { tags: ['9', '6'], performers: ['8'], studios: [] })
    const [, ex] = levels(f)
    assert.deepEqual(ex, { tags: { value: ['6', '5'], modifier: 'EXCLUDES', depth: -1 } })
    assert.equal(levels(f).length, 2)
  })

  it('drops every exclusion with unblocked', () => {
    const f = sceneFilter({ unblocked: true }, { tags: ['9'], performers: ['8'], studios: ['7'], people: { gender: null, firstYear: 2000, minAge: 20 } })
    assert.deepEqual(levels(f), [{}])
  })

  it('puts the people criterion (an OR chain) last, with at most 16 date buckets', () => {
    const f = sceneFilter({ maxHeight: 720 }, { ...none, people: { gender: { value: 'FEMALE', modifier: 'INCLUDES' }, firstYear: 1990, minAge: 18, maxAge: 25 } })
    const last = levels(f).at(-1)!
    assert.ok(last.date && last.performers_filter, 'the last level is the first age bucket')
    let n = 0
    for (let node = last; node; node = node.OR as Record<string, unknown>) {
      n++
      assert.equal(node.AND, undefined, 'no AND beside an OR')
    }
    assert.ok(n <= 16, `${n} buckets`)
    assert.ok(n >= 2)
  })

  it('a list with its own age filter replaces the Settings default', () => {
    const blocked: Exclusions = { ...none, people: { gender: null, firstYear: 2020, ethnicities: ['Asian'] } }
    const own = sceneFilter({ minAge: 30 }, blocked)
    const chain = JSON.stringify(own)
    assert.ok(chain.includes('birthdate'))
    assert.ok(!chain.includes('Asian'))
  })
})

describe('findFilter', () => {
  it('turns a random sort into a seeded one and pages from 1', () => {
    assert.deepEqual(findFilter({ sort: 'random', seed: 42 }), { q: undefined, sort: 'random_42', direction: 'DESC', page: 1, per_page: 40 })
    assert.equal(findFilter({ sort: 'date', dir: 'asc', page: 3, perPage: 10 }).direction, 'ASC')
  })

describe('isBlocked', () => {
  const ex = { tags: ['9'], performers: ['8'], studios: ['7'] }
  const scene = (o: object) => ({ tags: [], performers: [], studio: null, ...o }) as Parameters<typeof isBlocked>[0]
  it('excludes by tag, performer, studio and the studio\'s parent', () => {
    assert.equal(isBlocked(scene({ tags: [{ id: '9' }] }), ex), true)
    assert.equal(isBlocked(scene({ performers: [{ id: '1' }, { id: '8' }] }), ex), true)
    assert.equal(isBlocked(scene({ studio: { id: '7' } }), ex), true)
    assert.equal(isBlocked(scene({ studio: { id: '70', parent_studio: { id: '7' } } }), ex), true)
    assert.equal(isBlocked(scene({ tags: [{ id: '1' }], performers: [{ id: '2' }], studio: { id: '3' } }), ex), false)
  })
})

// A rating, O, edit or favourite drops only its own entity and leaves lists stale (served once
// more while they refresh); until 2026-10-31 they dropped every 'scene' entry, so Home rebuilt cold.
describe('writes and the query cache', () => {
  const seed = async (key: string, tags: string[]) => dataCache.get(key, 60_000, tags, async () => 'old')
  const read = (key: string, tags: string[]) => dataCache.get(key, 60_000, tags, async () => 'new')

  it('a rating or an O drops the scene and only marks the lists stale', () =>
    withStash(async () => {
      await seed('list', ['scene'])
      await seed('one', ['scene', 'scene:1'])
      await seed('other', ['scene', 'scene:2'])
      await updateSceneRating('1', 4)
      assert.equal(await read('one', ['scene', 'scene:1']), 'new', 'the rated scene is refetched')
      assert.equal(await read('list', ['scene']), 'old', 'the list is served stale')
      assert.equal(await read('other', ['scene', 'scene:2']), 'old')
      await tick()
      assert.equal(await read('list', ['scene']), 'new', 'and refreshed behind it')
      await seed('two', ['scene', 'scene:2'])
      await addSceneO('2')
      assert.equal(await read('two', ['scene', 'scene:2']), 'new')
    }))

  it('a tag edit also marks the tag lists stale; a title edit leaves them fresh', () =>
    withStash(async () => {
      await seed('tags', ['tag'])
      await seed('one', ['scene', 'scene:1'])
      await updateScene('1', { title: 'x' })
      assert.equal(await read('one', ['scene', 'scene:1']), 'new')
      const before = dataCache.stats().staleHits
      assert.equal(await read('tags', ['tag']), 'old')
      assert.equal(dataCache.stats().staleHits, before, 'still fresh')
      await updateScene('1', { tagIds: ['5'] })
      await read('tags', ['tag'])
      assert.equal(dataCache.stats().staleHits, before + 1, 'stale now')
    }))

  it('a performer favourite drops the performer and leaves performer and scene lists stale', () =>
    withStash(async () => {
      await seed('perf', ['performer', 'performer:7'])
      await seed('perfs', ['performer'])
      await seed('rows', ['scene'])
      await setPerformerFavorite('7', true)
      assert.equal(await read('perf', ['performer', 'performer:7']), 'new')
      const before = dataCache.stats().staleHits
      assert.equal(await read('perfs', ['performer']), 'old')
      assert.equal(await read('rows', ['scene']), 'old')
      assert.equal(dataCache.stats().staleHits, before + 2)
    }))
})

// After Stash's fingerprint moves the cache is expired at once, but the re-warm waits until it
// has held still for two polls and runs at most every 5 min: a scan moves it on every poll.
describe('WarmDebounce', () => {
  it('warms after two unchanged polls, not while the fingerprint keeps moving', () => {
    const d = new WarmDebounce({ stablePolls: 2, minGap: 300_000 })
    let t = 0
    const poll = (changed: boolean) => d.poll(changed, (t += 60_000))
    assert.equal(poll(false), false, 'nothing changed yet')
    assert.equal(poll(true), false)
    assert.equal(poll(true), false, 'still moving')
    assert.equal(poll(false), false, 'one quiet poll')
    assert.equal(poll(true), false, 'moved again: start over')
    assert.equal(poll(false), false)
    assert.equal(poll(false), true, 'two quiet polls: warm')
    assert.equal(poll(false), false, 'once')
  })

  it('holds a second warm until 5 min have passed since the last', () => {
    const d = new WarmDebounce({ stablePolls: 2, minGap: 300_000 })
    let t = 0
    const poll = (changed: boolean) => d.poll(changed, (t += 60_000))
    poll(true)
    poll(false)
    assert.equal(poll(false), true) // t = 3 min
    poll(true) // 4 min
    poll(false) // 5
    assert.equal(poll(false), false, 'stable, but only 3 min since the last warm') // 6
    assert.equal(poll(false), false) // 7
    assert.equal(poll(false), true, '5 min passed') // 8
  })
})

describe('groupFolder', () => {
  it('is the folder above the scene\'s own folder, never the library itself', () => {
    assert.equal(groupFolder('/data/adult/scenes/Net/Studio/2023 - Title [id]/f.mp4'), '/data/adult/scenes/Net/Studio')
    assert.equal(groupFolder('/data/adult/scenes/Jane Doe/2023-08-05 - Wife [6719]/clip.mp4'), '/data/adult/scenes/Jane Doe') // a pack
    assert.equal(groupFolder('/data/adult/scenes/loose/f.mp4'), null) // would be the library
    assert.equal(groupFolder('/data/adult/scenes/f.mp4'), null)
    assert.equal(groupFolder(undefined), null)
  })
})
})
