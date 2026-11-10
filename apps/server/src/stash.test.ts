// The filter builder: Stash accepts one criterion per field per level and no AND beside an
// OR, and SQLite's parser overflows on long OR chains. These rules only show up as 500s from
// Stash, so they are pinned here.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type Exclusions, findFilter, sceneFilter, isBlocked, unlistedReasons, withinReasons, groupFolder, groupHistory, missingSceneId, dataCache, updateSceneRating, addSceneO, setPerformerFavorite, updateScene, WarmDebounce } from './stash.ts'

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

  it('holds Unlisted videos out only when asked, merged into the blocklist criteria, and lets a named one back in', () => {
    const u = { ...none, unlisted: { tags: ['3', '4'], performers: ['5'], studios: ['6'] } }
    const out = [
      {},
      { tags: { value: ['3', '4'], modifier: 'EXCLUDES', depth: -1 } },
      { performers: { value: ['5'], modifier: 'EXCLUDES' } },
      { studios: { value: ['6'], modifier: 'EXCLUDES', depth: -1 } },
    ]
    assert.deepEqual(levels(sceneFilter({}, u)), [{}], 'Browse shows Unlisted videos')
    assert.deepEqual(levels(sceneFilter({}, { ...u, holdUnlisted: true })), out, 'a curated view holds them out')
    assert.deepEqual(levels(sceneFilter({ noUnlisted: true }, u)), out, 'stations hold them out')
    // one criterion per field for blocked and Unlisted together: Stash ignored a second tags one (2026-11-09)
    assert.deepEqual(levels(sceneFilter({}, { ...u, tags: ['9'], performers: ['8'], holdUnlisted: true }))[1], { tags: { value: ['9', '3', '4'], modifier: 'EXCLUDES', depth: -1 } })
    assert.deepEqual(levels(sceneFilter({}, { ...u, tags: ['9'], performers: ['8'], holdUnlisted: true }))[2], { performers: { value: ['8', '5'], modifier: 'EXCLUDES' } })
  })

  it('lets only the named Unlisted entity in, not the others', () => {
    const u = { ...none, unlisted: { tags: ['3', '4'], performers: ['5'], studios: [] }, holdUnlisted: true }
    const [, tags, perf] = levels(sceneFilter({ noUnlisted: true, tags: '4' }, u))
    assert.deepEqual(tags, { tags: { value: ['3'], modifier: 'EXCLUDES', depth: -1 } })
    assert.deepEqual(perf, { performers: { value: ['5'], modifier: 'EXCLUDES' } })
    assert.equal(levels(sceneFilter({ performers: '5' }, u)).some((l) => 'performers' in l && (l.performers as { modifier: string }).modifier === 'EXCLUDES'), false)
  })

  it('lists the Vault as an OR of the Unlisted categories, performers and studios', () => {
    const u = { ...none, unlisted: { tags: ['3'], performers: ['5'], studios: ['6'] }, holdUnlisted: true }
    const f = sceneFilter({ vault: true }, u)
    const last = levels(f).at(-1)!
    assert.deepEqual(last.tags, { value: ['3'], modifier: 'INCLUDES', depth: -1 })
    assert.deepEqual((last.OR as Record<string, unknown>).performers, { value: ['5'], modifier: 'INCLUDES' })
    assert.deepEqual(((last.OR as Record<string, unknown>).OR as Record<string, unknown>).studios, { value: ['6'], modifier: 'INCLUDES', depth: -1 })
    assert.equal(levels(f).length, 2, 'no exclusion in the Vault')
    assert.deepEqual(levels(sceneFilter({ vault: true }, { ...none, unlisted: { tags: [], performers: [], studios: [] } }))[1], { id: { value: 0, modifier: 'EQUALS' } }, 'nothing Unlisted: nothing')
    assert.equal(levels(sceneFilter({ vault: true, unblocked: true }, { ...u, tags: ['9'] })).length, 2, 'Show blocked keeps the Vault requirement')
  })

  it('distributes the Vault over the age buckets in one OR chain of at most 16', () => {
    const u = { ...none, unlisted: { tags: ['3'], performers: ['5'], studios: ['6'] }, people: { gender: null, firstYear: 1990, minAge: 18, maxAge: 25 } }
    const last = levels(sceneFilter({ vault: true }, u)).at(-1)!
    let n = 0
    for (let node: Record<string, unknown> | undefined = last; node; node = node.OR as Record<string, unknown>) {
      n++
      assert.ok(node.date && node.performers_filter, 'each alternative keeps its age bucket')
      assert.ok(node.tags || node.performers || node.studios, 'and one Vault reason')
      assert.equal('AND' in node, false, 'no AND beside an OR')
    }
    assert.ok(n <= 16 && n >= 3, `${n} alternatives`)
    let one = 0
    const single = levels(sceneFilter({ vault: true }, { ...u, unlisted: { tags: ['3'], performers: [], studios: [] }, people: { gender: null, firstYear: 1970, minAge: 18, maxAge: 25 } })).at(-1)!
    for (let node: Record<string, unknown> | undefined = single; node; node = node.OR as Record<string, unknown>) one++
    assert.ok(one <= 16, `one kind over a long library: ${one} alternatives (27 overflowed, 2026-11-09)`)
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
    const unl = { tags: ['4'], performers: ['44'], studios: ['77'] }
    assert.equal(isBlocked(scene({ tags: [{ id: '4' }] }), { ...ex, unlisted: unl }), false, 'Unlisted shows unless held out')
    assert.equal(isBlocked(scene({ tags: [{ id: '4' }] }), { ...ex, unlisted: unl, holdUnlisted: true }), true)
    assert.equal(isBlocked(scene({ studio: { id: '70', parent_studio: { id: '77' } } }), { ...ex, unlisted: unl, holdUnlisted: true }), true, 'a sub-studio of an Unlisted one')
  })
})

describe('related videos and Unlisted reasons', () => {
  const u = { tags: ['3', '4'], performers: ['5'], studios: ['6'] }
  const scene = (o: object) => ({ tags: [], performers: [], studio: null, ...o }) as Parameters<typeof unlistedReasons>[0]
  it('names every reason a scene is Unlisted', () => {
    assert.deepEqual([...unlistedReasons(scene({ tags: [{ id: '3' }, { id: '9' }], performers: [{ id: '5' }], studio: { id: '60', parent_studio: { id: '6' } } }), u)].sort(), ['performer:5', 'studio:6', 'tag:3'])
    assert.equal(unlistedReasons(scene({ tags: [{ id: '9' }] }), u).size, 0)
  })
  it('lets a candidate follow only a source that shares all of its reasons', () => {
    const src = unlistedReasons(scene({ tags: [{ id: '3' }] }), u)
    assert.equal(withinReasons(unlistedReasons(scene({ tags: [{ id: '3' }] }), u), src), true, 'same category')
    assert.equal(withinReasons(unlistedReasons(scene({ tags: [{ id: '3' }], performers: [{ id: '5' }] }), u), src), false, 'plus an Unlisted performer')
    assert.equal(withinReasons(unlistedReasons(scene({ tags: [{ id: '9' }] }), u), src), true, 'not Unlisted at all')
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
      await updateScene('1', { addTagIds: ['5'] })
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

describe('groupHistory', () => {
  const card = (id: string) => ({ id }) as unknown as Parameters<typeof groupHistory>[0][number]['card']
  it("folds a video's plays per day in the browser's zone, newest first, and pages", () => {
    const scenes = [
      // 03:00 UTC on the 2nd is still the 1st in New York (tz 300)
      { card: card('1'), times: ['2026-11-01T20:00:00Z', '2026-11-02T03:00:00Z', '2026-11-02T18:00:00Z'] },
      { card: card('2'), times: ['2026-11-02T12:00:00Z'] },
    ]
    const ny = groupHistory(scenes, 300, 1, 10)
    assert.equal(ny.total, 3)
    assert.deepEqual(
      ny.items.map((e) => [e.scene.id, e.day, e.times.length, e.playedAt]),
      [
        ['1', '2026-11-02', 1, '2026-11-02T18:00:00Z'],
        ['2', '2026-11-02', 1, '2026-11-02T12:00:00Z'],
        ['1', '2026-11-01', 2, '2026-11-02T03:00:00Z'],
      ],
    )
    assert.equal(groupHistory(scenes, 0, 1, 10).total, 3) // UTC: 20:00 on the 1st alone, the two on the 2nd together
    assert.deepEqual(groupHistory(scenes, 300, 2, 2).items.map((e) => e.day), ['2026-11-01'])
  })
})

describe('findScenesByIds', () => {
  it("reads the id of a deleted scene from Stash's error", () => {
    assert.equal(missingSceneId(new Error('stash: scene with id 3302 not found')), '3302')
    assert.equal(missingSceneId(new Error('Stash: database is locked')), null)
  })
})
